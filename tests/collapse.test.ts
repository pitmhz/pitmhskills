import { describe, it, expect } from "bun:test";
import { collapse } from "../src/collapse.ts";
import { mkCard, mkRanked } from "./helpers.ts";

describe("collapse", () => {
  it("passes solo cards through sorted by fused desc", () => {
    const a = mkRanked(mkCard({ id: "a__one" }), 0.5);
    const b = mkRanked(mkCard({ id: "b__two" }), 1.2);
    const out = collapse([a, b], "some task");
    expect(out.map((r) => r.card.id)).toEqual(["b__two", "a__one"]);
  });

  it("primary wins a cluster when no predicate hits", () => {
    const primary = mkRanked(
      mkCard({ id: "p__main", cluster: "c1", cluster_role: "primary" }),
      2.0,
    );
    const variant = mkRanked(
      mkCard({
        id: "p__var",
        cluster: "c1",
        cluster_role: "variant",
        pick_over_primary_when: "only for specialized widget work",
      }),
      1.0,
    );
    const out = collapse([primary, variant], "fix billing invoice totals");
    expect(out.map((r) => r.card.id)).toEqual(["p__main"]);
  });

  it("variant wins on token-exact predicate hit and earns +0.6 fused bonus", () => {
    const primary = mkRanked(
      mkCard({ id: "p__main", cluster: "c1", cluster_role: "primary" }),
      2.0,
    );
    const variant = mkRanked(
      mkCard({
        id: "p__var",
        cluster: "c1",
        cluster_role: "variant",
        pick_over_primary_when: "prefer for postgres row level security policies",
      }),
      1.0,
    );
    const before = variant.fused;
    const out = collapse([primary, variant], "write postgres row level security policy");
    expect(out[0]!.card.id).toBe("p__var");
    expect(out[0]!.fused).toBeCloseTo(before + 0.6, 9);
  });

  it("help/helper trap: 'help' task does not trigger 'helper' predicate (token-exact, no substring)", () => {
    const primary = mkRanked(
      mkCard({ id: "p__main", cluster: "c1", cluster_role: "primary" }),
      2.0,
    );
    const variant = mkRanked(
      mkCard({
        id: "p__var",
        cluster: "c1",
        cluster_role: "variant",
        pick_over_primary_when: "prefer for helper widget utilities",
      }),
      1.0,
    );
    const out = collapse([primary, variant], "I need help with my setup");
    expect(out.map((r) => r.card.id)).toEqual(["p__main"]);
    expect(variant.fused).toBe(1.0); // no bonus applied
  });

  it("variant with empty predicate never hijacks the cluster even when fused is higher", () => {
    const primary = mkRanked(
      mkCard({ id: "p__main", cluster: "c1", cluster_role: "primary" }),
      1.0,
    );
    const variant = mkRanked(
      mkCard({
        id: "p__var",
        cluster: "c1",
        cluster_role: "variant",
        pick_over_primary_when: "",
      }),
      9.0,
    );
    const out = collapse([primary, variant], "anything at all here");
    expect(out.map((r) => r.card.id)).toEqual(["p__main"]);
  });

  it("short predicate words (len<=3) cannot trigger a hit", () => {
    const primary = mkRanked(
      mkCard({ id: "p__main", cluster: "c1", cluster_role: "primary" }),
      2.0,
    );
    const variant = mkRanked(
      mkCard({
        id: "p__var",
        cluster: "c1",
        cluster_role: "variant",
        pick_over_primary_when: "for fun use only",
      }),
      1.0,
    );
    const out = collapse([primary, variant], "have fun with the ui");
    expect(out.map((r) => r.card.id)).toEqual(["p__main"]);
  });
});
