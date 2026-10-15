import { describe, it, expect, afterEach } from "bun:test";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { deriveCombos, applyCombos, type ComboRow } from "../src/combos.ts";
import { validateCard } from "../src/types.ts";
import { mkCard } from "./helpers.ts";

let dirs: string[] = [];
afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs = [];
});
function tempDir() {
  const d = mkdtempSync(join(tmpdir(), "pitmh-combos-"));
  dirs.push(d);
  return d;
}
function seed(dir: string, ids: string[]) {
  for (const id of ids) {
    writeFileSync(join(dir, `${id}.json`), JSON.stringify(mkCard({ id }), null, 2) + "\n");
  }
}
const snap = (dir: string, id: string) => readFileSync(join(dir, `${id}.json`), "utf8");

// Fixed timestamps: no wall-clock nondeterminism.
function seqRow(ts: number, skill: string, hash: string, outcome = "PICK"): ComboRow {
  return { ts, task_hash: hash, outcome, skill_id: skill, confidence: 80 };
}

describe("combos deriveCombos", () => {
  const cards = () => [
    mkCard({ id: "p__alpha", cluster: "cA" }),
    mkCard({ id: "p__beta", cluster: "cB" }),
  ];

  it("locks an A->B phase sequence seen >= minCount", () => {
    const rows = [
      seqRow(1, "p__alpha", "h1"), seqRow(2, "p__beta", "h2"),
      seqRow(3, "p__alpha", "h3"), seqRow(4, "p__beta", "h4"),
      seqRow(5, "p__alpha", "h5"), seqRow(6, "p__beta", "h6"),
    ];
    const out = deriveCombos(rows, cards(), 3);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ a: "p__alpha", b: "p__beta", count: 3 });
  });

  it("ignores self re-routes, same-task re-picks, and non-PICK rows", () => {
    const rows = [
      seqRow(1, "p__alpha", "h1"), seqRow(2, "p__alpha", "h2"), // same skill
      seqRow(3, "p__beta", "h2"), // same task_hash as previous
      seqRow(4, "p__alpha", "h3", "ASK"), // not a PICK
      seqRow(5, "p__beta", "h4"),
    ];
    expect(deriveCombos(rows, cards(), 1)).toEqual([]);
  });

  it("enforces minCount and sorts by count desc", () => {
    const rows = [
      seqRow(1, "p__alpha", "h1"), seqRow(2, "p__beta", "h2"),
      seqRow(3, "p__alpha", "h3"), seqRow(4, "p__beta", "h4"),
    ];
    expect(deriveCombos(rows, cards(), 3)).toEqual([]);
    // transitions: A->B x2, B->A x1 -> two pairs, count desc
    const out = deriveCombos(rows, cards(), 1);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ a: "p__alpha", b: "p__beta", count: 2 });
    expect(out[1]).toMatchObject({ a: "p__beta", b: "p__alpha", count: 1 });
  });

  it("skips tier-C, already-paired, same-cluster, and unknown cards", () => {
    const tierC = [
      mkCard({ id: "p__alpha", cluster: "cA", tier: "C" }),
      mkCard({ id: "p__beta", cluster: "cB" }),
    ];
    const rows = [seqRow(1, "p__alpha", "h1"), seqRow(2, "p__beta", "h2")];
    expect(deriveCombos(rows, tierC, 1)).toEqual([]);
    const paired = [
      mkCard({ id: "p__alpha", cluster: "cA", pairs_with: "p__other" }),
      mkCard({ id: "p__beta", cluster: "cB" }),
    ];
    expect(deriveCombos(rows, paired, 1)).toEqual([]);
    const sameCluster = [mkCard({ id: "p__alpha", cluster: "c" }), mkCard({ id: "p__beta", cluster: "c" })];
    expect(deriveCombos(rows, sameCluster, 1)).toEqual([]);
    expect(deriveCombos(rows, [mkCard({ id: "p__alpha", cluster: "cA" })], 1)).toEqual([]);
  });
});

describe("combos applyCombos", () => {
  const pair = { a: "p__alpha", b: "p__beta", count: 3, why: "test" };

  it("sets pairs_with on A only plus curated on temp-dir copies", () => {
    const dir = tempDir();
    seed(dir, ["p__alpha", "p__beta"]);
    const res = applyCombos(dir, [pair], {
      cardsDir: dir,
      evalFn: () => ({ top1: 0.8 }),
    });
    expect(res.ok).toBe(true);
    expect(res.beforeTop1).toBe(0.8);
    const ca = JSON.parse(snap(dir, "p__alpha"));
    const cb = JSON.parse(snap(dir, "p__beta"));
    expect(validateCard(ca)).toEqual([]);
    expect(validateCard(cb)).toEqual([]);
    expect(ca.pairs_with).toBe("p__beta");
    expect(ca.curated).toBe(true);
    expect(cb.pairs_with ?? null).toBeNull();
  });

  it("REFUSES and byte-restores when tune top1 drops (anti-creep: no compounding)", () => {
    const dir = tempDir();
    seed(dir, ["p__alpha", "p__beta"]);
    const beforeAlpha = snap(dir, "p__alpha");
    let calls = 0;
    const res = applyCombos(dir, [pair], {
      cardsDir: dir,
      evalFn: () => ({ top1: calls++ === 0 ? 0.8 : 0.5 }),
    });
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/^REFUSED/);
    expect(snap(dir, "p__alpha")).toBe(beforeAlpha);
  });

  it("skips already-paired A (cap), tier C, same cluster, unknown ids", () => {
    const dir = tempDir();
    seed(dir, ["p__alpha", "p__beta"]);
    const res = applyCombos(
      dir,
      [
        { a: "p__alpha", b: "p__ghost", count: 3, why: "test" },
        { a: "p__ghost", b: "p__alpha", count: 3, why: "test" },
      ],
      { cardsDir: dir, evalFn: () => ({ top1: 1 }) },
    );
    expect(res.ok).toBe(true);
    expect(res.skipped.join()).toContain("unknown id");
  });

  it("never overwrites an existing pairs_with (cap holds across applies)", () => {
    const dir = tempDir();
    writeFileSync(
      join(dir, "p__alpha.json"),
      JSON.stringify(mkCard({ id: "p__alpha", pairs_with: "p__other" }), null, 2) + "\n",
    );
    writeFileSync(join(dir, "p__beta.json"), JSON.stringify(mkCard({ id: "p__beta" }), null, 2) + "\n");
    const res = applyCombos(dir, [pair], {
      cardsDir: dir,
      evalFn: () => ({ top1: 1 }),
    });
    expect(res.ok).toBe(true);
    expect(res.skipped.join()).toContain("already paired, cap");
    expect(JSON.parse(snap(dir, "p__alpha")).pairs_with).toBe("p__other");
  });

  it("reports nothing-to-apply on empty pairs", () => {
    const dir = tempDir();
    expect(applyCombos(dir, [], { cardsDir: dir, evalFn: () => ({ top1: 1 }) }).message).toBe(
      "nothing to apply",
    );
  });
});
