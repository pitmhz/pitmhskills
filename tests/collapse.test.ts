import { describe, it, expect } from "bun:test";
import { shortlist, predicateMatch, claimsTask } from "../src/collapse.ts";
import { mkCard, mkRanked } from "./helpers.ts";
import { buildLexicon } from "../src/lexicon-stats.ts";

describe("shortlist", () => {
  it("passes solo cards through sorted by fused desc", () => {
    const a = mkRanked(mkCard({ id: "a__one" }), 0.5);
    const b = mkRanked(mkCard({ id: "b__two" }), 1.2);
    const out = shortlist([a, b]).kept;
    expect(out.map((r) => r.card.id)).toEqual(["b__two", "a__one"]);
  });

  it("drops near-duplicate cards (same provider and purpose)", () => {
    const a = mkRanked(mkCard({ id: "x__same", purpose: "the same purpose text here" }), 2.0);
    const b = mkRanked(mkCard({ id: "x__same", purpose: "the same purpose text here" }), 1.0);
    const out = shortlist([a, b]);
    expect(out.kept.map((r) => r.card.id)).toEqual(["x__same"]);
    expect(out.deduped).toEqual(["x__same"]);
  });

  it("caps candidates per category so one category cannot fill the list", () => {
    const many = [0, 1, 2, 3, 4].map((i) =>
      mkRanked(mkCard({ id: `c__${i}`, cluster: "one", purpose: `distinct purpose number ${i}` }), 5 - i),
    );
    const other = mkRanked(mkCard({ id: "o__other", cluster: "two", purpose: "another card" }), 0.1);
    const out = shortlist([...many, other], { maxPerCluster: 2 });
    expect(out.kept.filter((r) => r.card.cluster === "one").length).toBe(2);
    expect(out.kept.map((r) => r.card.id)).toContain("o__other");
    expect(out.capped["one"]).toBe(3);
  });
});

describe("predicateMatch", () => {
  it("needs two matched tokens before a predicate fires", () => {
    const card = mkCard({
      id: "p__var",
      cluster: "c1",
      cluster_role: "variant",
      pick_over_primary_when: "prefer for postgres row level security policies",
    });
    // A realistic corpus: "postgres" is common, so one hit is a coincidence.
    const lex = buildLexicon([
      card,
      ...Array.from({ length: 12 }, (_, i) => mkCard({ id: `f__${i}`, purpose: `postgres and other database work ${i}` })),
    ]);
    expect(predicateMatch(card, "write postgres row level security policy", lex).hit).toBe(true);
    // One common word is a coincidence, not a routing signal.
    expect(predicateMatch(card, "the postgres migration", lex).hit).toBe(false);
  });

  it("short predicate words (len<=3) cannot trigger a hit", () => {
    const card = mkCard({
      id: "p__var",
      cluster: "c1",
      cluster_role: "variant",
      pick_over_primary_when: "for fun use only",
    });
    const lex = buildLexicon([card]);
    expect(predicateMatch(card, "have fun with the ui", lex).hit).toBe(false);
  });

  it("help/helper trap: a 'help' task does not trigger a 'helper' predicate", () => {
    const card = mkCard({
      id: "p__var",
      cluster: "c1",
      cluster_role: "variant",
      pick_over_primary_when: "prefer for helper widget utilities",
    });
    const lex = buildLexicon([card]);
    expect(predicateMatch(card, "I need help with my setup", lex).hit).toBe(false);
  });
});

describe("claimsTask", () => {
  it("a primary always claims the task", () => {
    const card = mkCard({ id: "p__main", cluster: "c1", cluster_role: "primary" });
    expect(claimsTask(card, "anything at all", undefined)).toBe(true);
  });

  it("a variant claims the task through its own predicate", () => {
    const card = mkCard({
      id: "p__var",
      cluster: "c1",
      cluster_role: "variant",
      pick_over_primary_when: "prefer for postgres row level security policies",
    });
    const lex = buildLexicon([card]);
    expect(claimsTask(card, "write postgres row level security policy", lex)).toBe(true);
  });

  it("a variant that does not claim the task says so", () => {
    const card = mkCard({
      id: "p__var",
      cluster: "c1",
      cluster_role: "variant",
      pick_over_primary_when: "prefer for postgres row level security policies",
    });
    const lex = buildLexicon([card]);
    expect(claimsTask(card, "design a landing page", lex)).toBe(false);
  });

  it("a variant claims the task through its disambiguator clause", () => {
    const card = mkCard({
      id: "p__var",
      cluster: "c1",
      cluster_role: "variant",
      disambiguator: "Harden a prototype for production -> this.",
    });
    const lex = buildLexicon([card]);
    expect(claimsTask(card, "harden a prototype for production", lex)).toBe(true);
  });
});
