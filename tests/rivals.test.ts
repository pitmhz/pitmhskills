import { describe, it, expect, afterEach } from "bun:test";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { deriveRivalries, applyRivalries } from "../src/rivals.ts";
import { validateCard } from "../src/types.ts";
import { mkCard } from "./helpers.ts";

let dirs: string[] = [];
afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs = [];
});
function tempDir() {
  const d = mkdtempSync(join(tmpdir(), "pitmh-rivals-"));
  dirs.push(d);
  return d;
}
function seed(dir: string, ids: string[]) {
  for (const id of ids) {
    writeFileSync(join(dir, `${id}.json`), JSON.stringify(mkCard({ id }), null, 2) + "\n");
  }
}
const snap = (dir: string, id: string) => readFileSync(join(dir, `${id}.json`), "utf8");

describe("rivals deriveRivalries", () => {
  const mk = (id: string, purpose: string, uw: string[] = []) =>
    mkCard({ id, cluster: "c1", purpose, use_when: [purpose, ...uw] });

  it("derives a rivalry from >=3 shared distinctive tokens", () => {
    const a = mk("p__alpha", "postgres row level security policy builder tool", ["rls policy builder"]);
    const b = mk("p__beta", "postgres row level security policy checker tool", ["rls policy checker"]);
    const out = deriveRivalries([a, b]);
    expect(out).toHaveLength(1);
    expect(out[0]!.a).toBe("p__alpha");
    expect(out[0]!.b).toBe("p__beta");
    expect(out[0]!.why).toContain('cluster "c1"');
  });

  it("returns [] across different clusters and below minShared", () => {
    const a = mkCard({ id: "p__alpha", cluster: "cA", purpose: "postgres policy work" });
    const b = mkCard({ id: "p__beta", cluster: "cB", purpose: "postgres policy work" });
    expect(deriveRivalries([a, b])).toEqual([]);
    const c = mk("p__one", "alpha bravo work");
    const d = mk("p__two", "alpha bravo tasks");
    expect(deriveRivalries([c, d])).toEqual([]);
  });

  it("excludes cluster-generic tokens (seen in >half of cluster-mates)", () => {
    const body = "alpha bravo charlie delta";
    const cards = ["g__one", "g__two", "g__three"].map((id) =>
      mkCard({ id, cluster: "gc", purpose: body, use_when: [body] }),
    );
    // every token has df=3 > max(2, 1.5): all generic -> no distinctive overlap
    expect(deriveRivalries(cards)).toEqual([]);
  });

  it("skips pairs already carrying conflicts_with and sorts/caps output", () => {
    const a = mk("p__alpha", "postgres row level security policy builder tool");
    const b = mk("p__beta", "postgres row level security policy checker tool");
    const withEdge = { ...a, conflicts_with: ["p__beta"] };
    expect(deriveRivalries([withEdge, b])).toEqual([]);
    const many = Array.from({ length: 6 }, (_, i) =>
      mk(`p__n${i}`, "postgres row level security policy variant tool"),
    );
    const out = deriveRivalries(many, 2);
    expect(out.length).toBeLessThanOrEqual(2);
    const ids = out.map((p) => `${p.a} ${p.b}`);
    expect([...ids].sort()).toEqual(ids);
  });
});

describe("rivals applyRivalries", () => {
  it("applies conflicts_with both sides plus curated on temp-dir copies", () => {
    const dir = tempDir();
    seed(dir, ["p__alpha", "p__beta"]);
    const res = applyRivalries(dir, [{ a: "p__alpha", b: "p__beta", why: "test" }], {
      cardsDir: dir,
      evalFn: () => ({ top1: 0.8 }),
    });
    expect(res.ok).toBe(true);
    expect(res.beforeTop1).toBe(0.8);
    expect(res.afterTop1).toBe(0.8);
    for (const id of ["p__alpha", "p__beta"]) {
      const card = JSON.parse(snap(dir, id));
      expect(validateCard(card)).toEqual([]);
      expect(card.curated).toBe(true);
    }
    expect(JSON.parse(snap(dir, "p__alpha")).conflicts_with).toContain("p__beta");
    expect(JSON.parse(snap(dir, "p__beta")).conflicts_with).toContain("p__alpha");
  });

  it("REFUSES and byte-restores when tune top1 drops", () => {
    const dir = tempDir();
    seed(dir, ["p__alpha", "p__beta"]);
    const before = new Map(["p__alpha", "p__beta"].map((id) => [id, snap(dir, id)]));
    let calls = 0;
    const res = applyRivalries(dir, [{ a: "p__alpha", b: "p__beta", why: "test" }], {
      cardsDir: dir,
      evalFn: () => ({ top1: calls++ === 0 ? 0.8 : 0.5 }),
    });
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/^REFUSED/);
    for (const [id, bytes] of before) expect(snap(dir, id)).toBe(bytes);
  });

  it("REFUSES before touching files when the before-eval fails", () => {
    const dir = tempDir();
    seed(dir, ["p__alpha", "p__beta"]);
    const res = applyRivalries(dir, [{ a: "p__alpha", b: "p__beta", why: "test" }], {
      cardsDir: dir,
      evalFn: () => {
        throw new Error("boom");
      },
    });
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/^REFUSED: before-eval failed/);
  });

  it("reports nothing-to-apply on empty pairs and skips unknown ids", () => {
    const dir = tempDir();
    seed(dir, ["p__alpha"]);
    expect(applyRivalries(dir, [], { cardsDir: dir, evalFn: () => ({ top1: 1 }) }).message).toBe(
      "nothing to apply",
    );
    const res = applyRivalries(dir, [{ a: "p__alpha", b: "p__ghost", why: "test" }], {
      cardsDir: dir,
      evalFn: () => ({ top1: 1 }),
    });
    expect(res.ok).toBe(true);
    expect(res.skipped.join()).toContain("unknown id");
  });
});
