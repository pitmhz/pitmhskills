import { describe, it, expect } from "bun:test";
import { scoreCandidates, decide, buildAskQuestion } from "../src/decide.ts";
import { mkCard, mkRanked } from "./helpers.ts";

describe("decide scoreCandidates", () => {
  it("ranks true token match above substring lookalike (help vs helper)", () => {
    const helper = mkRanked(
      mkCard({
        id: "a__helper",
        purpose: "helper utilities for widgets",
        use_when: ["helper utilities for widgets"],
      }),
      1,
    );
    const help = mkRanked(
      mkCard({
        id: "b__help",
        purpose: "help with billing questions",
        use_when: ["help with billing questions"],
      }),
      0.9,
    );
    const out = scoreCandidates([helper, help], "I need help with my setup");
    expect(out[0]!.id).toBe("b__help");
    expect(out[0]!.score).toBeGreaterThan(out[1]!.score);
  });

  it("excludes stopwords from cover so verbose cards cannot inflate overlap", () => {
    const card = mkRanked(
      mkCard({
        id: "a__x",
        purpose: "the and for with this that dashboard",
        use_when: ["the and for with this that dashboard"],
      }),
      0,
      0,
    );
    const out = scoreCandidates([card], "how to use the dashboard with data");
    // only "dashboard" (+ maybe "data") count; function words add nothing
    expect(out[0]!.score).toBeLessThan(100);
    expect(Number.isFinite(out[0]!.score)).toBe(true);
  });

  it("all-stopword task yields cover 0 and finite scores (no NaN)", () => {
    const card = mkRanked(mkCard({ id: "a__x" }), 0, 0);
    const out = scoreCandidates([card], "how to use the thing");
    expect(out).toHaveLength(1);
    expect(Number.isFinite(out[0]!.score)).toBe(true);
  });

  it("rank decay prefers the earlier-ranked of two identical cards", () => {
    const mk = (id: string) =>
      mkRanked(
        mkCard({ id, purpose: "postgres policy work", use_when: ["postgres policy work"] }),
        1,
        0.1,
      );
    const out = scoreCandidates([mk("a__one"), mk("b__two")], "postgres policy work");
    expect(out[0]!.id).toBe("a__one");
    expect(out[0]!.score).toBeGreaterThan(out[1]!.score);
  });
});

describe("decide outcome", () => {
  const r = (id: string, score: number) => ({ id, score, reason: `matches "${id}"` });

  it("ABSTAIN on empty ranking", () => {
    expect(decide([], [], 30, 10, 60)).toEqual({ outcome: "ABSTAIN", top: null, second: null });
  });

  it("ABSTAIN when top is below floor", () => {
    const d = decide([r("a", 20), r("b", 10)], [], 30, 10, 60);
    expect(d.outcome).toBe("ABSTAIN");
    expect(d.top!.id).toBe("a");
  });

  it("PICK when top clears pickFloor with margin", () => {
    const d = decide([r("a", 80), r("b", 40)], [], 30, 10, 60);
    expect(d.outcome).toBe("PICK");
    expect(d.top!.id).toBe("a");
    expect(d.second!.id).toBe("b");
  });

  it("PICK when top clears floor with margin even below pickFloor", () => {
    const d = decide([r("a", 45), r("b", 20)], [], 30, 10, 60);
    expect(d.outcome).toBe("PICK");
  });

  it("ASK when top clears floor but margin is too small", () => {
    const d = decide([r("a", 70), r("b", 66)], [], 30, 10, 60);
    expect(d.outcome).toBe("ASK");
    expect(d.top!.id).toBe("a");
    expect(d.second!.id).toBe("b");
  });

  it("PICK for a lone candidate above floor (margin defaults to 99)", () => {
    const d = decide([r("a", 50)], [], 30, 10, 60);
    expect(d.outcome).toBe("PICK");
    expect(d.second).toBeNull();
  });

  it("ABSTAIN for a lone candidate when margin exceeds the 99 default", () => {
    const d = decide([r("a", 50)], [], 30, 100, 60);
    expect(d.outcome).toBe("ABSTAIN");
  });
});

describe("buildAskQuestion", () => {
  it("uses disambiguators for both skills", () => {
    const top = mkRanked(mkCard({ id: "a__one", disambiguator: "handles postgres" }));
    const second = mkRanked(mkCard({ id: "b__two", disambiguator: "handles billing" }));
    const q = buildAskQuestion(top, second);
    expect(q).toContain("a__one");
    expect(q).toContain("handles postgres");
    expect(q).toContain("b__two");
    expect(q).toContain("handles billing");
    expect(q).toContain("Reply 1 or 2.");
  });

  it("falls back to purpose when disambiguator is missing", () => {
    const top = mkRanked(mkCard({ id: "a__one", purpose: "alpha purpose here" }));
    const second = mkRanked(mkCard({ id: "b__two", purpose: "beta purpose here" }));
    const q = buildAskQuestion(top, second);
    expect(q).toContain("alpha purpose here");
    expect(q).toContain("beta purpose here");
  });
});
