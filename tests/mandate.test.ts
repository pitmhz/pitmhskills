import { describe, it, expect } from "bun:test";
import { buildMandate, distillGuard, MANDATE_CAP } from "../src/mandate.ts";
import { mkCard } from "./helpers.ts";

const enc = new TextEncoder();
const bytes = (s: string) => enc.encode(s).length;

function profile(over: Record<string, unknown> = {}) {
  return {
    version: 1,
    stack: [],
    signals_sha: "x",
    mandatory: [],
    preferred: [],
    blocked: [],
    grill_answers: [],
    budget: { always_on_bytes: 1, per_task_bytes: 1 },
    updated_at: 0,
    ...over,
  } as unknown as Parameters<typeof buildMandate>[0];
}

describe("mandate", () => {
  it("exposes MANDATE_CAP 600", () => {
    expect(MANDATE_CAP).toBe(600);
  });

  it("small mandate is untruncated and lists mandatory/blocked/ponytail", () => {
    const m = buildMandate(
      profile({
        mandatory: [{ id: "local__cavemem", why: "repo-wide memory", guard_bytes: 1800 }],
        blocked: ["pocock__grill-me"],
        ponytail_mode: "strict",
      }),
    );
    expect(m).toContain("MANDATORY: local__cavemem (repo-wide memory)");
    expect(m).toContain("BLOCKED: 1 skills excluded");
    expect(m).toContain("PONYTAIL: strict");
    expect(m).toContain("Call `route` with every task");
    expect(bytes(m)).toBeLessThanOrEqual(600);
  });

  it("empty mandatory lists 'MANDATORY: none' and omits BLOCKED/PONYTAIL", () => {
    const m = buildMandate(profile());
    expect(m).toContain("MANDATORY: none");
    expect(m).not.toContain("BLOCKED");
    expect(m).not.toContain("PONYTAIL");
  });

  it("truncates a large mandate to exactly MANDATE_CAP bytes with '...' suffix", () => {
    const m = buildMandate(
      profile({
        mandatory: Array.from({ length: 50 }, (_, i) => ({
          id: `s${i}`,
          why: `reason number ${i} with extra text padding`,
          guard_bytes: 1,
        })),
      }),
    );
    expect(bytes(m)).toBe(600);
    expect(m.endsWith("...")).toBe(true);
  });

  it("distillGuard fits 1800B and carries id/use_when/scope/not-for/slop", () => {
    const g = distillGuard(mkCard({ id: "a__demo", purpose: "demo purpose" }));
    expect(bytes(g)).toBeLessThanOrEqual(1800);
    expect(g).toContain("a__demo: demo purpose");
    expect(g).toContain("Use when:");
    expect(g).toContain("Scope:");
    expect(g).toContain("Not for:");
    expect(g).toContain("Slop:");
  });

  it("distillGuard packs at most 3 use_when and 2 do_not_use_when", () => {
    const g = distillGuard(
      mkCard({
        id: "a__x",
        use_when: ["u1", "u2", "u3", "u4", "u5"],
        do_not_use_when: ["d1", "d2", "d3"],
      }),
    );
    expect(g).toContain("u3");
    expect(g).not.toContain("u4");
    expect(g).toContain("d2");
    expect(g).not.toContain("d3");
  });

  it("distillGuard truncates oversized cards with the get_ref suffix", () => {
    const g = distillGuard(
      mkCard({
        id: "h__huge",
        purpose: "p",
        use_when: Array.from({ length: 5 }, () => "u ".repeat(200)),
        do_not_use_when: Array.from({ length: 5 }, () => "d ".repeat(200)),
        scope: "s ".repeat(500),
      }),
    );
    expect(bytes(g)).toBeLessThanOrEqual(1800);
    expect(g.endsWith("…(full body via get_ref)")).toBe(true);
  });
});
