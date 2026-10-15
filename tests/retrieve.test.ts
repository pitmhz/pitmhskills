import { describe, it, expect } from "bun:test";
import { tokenize, embed, cosine, VEC_DIM, STOPWORDS } from "../src/retrieve.ts";

describe("retrieve tokenize", () => {
  it("lowercases and splits on non-alphanumerics", () => {
    expect(tokenize("Hello-World_foo.bar")).toEqual(["hello", "world", "foo", "bar"]);
  });

  it("strips stopwords (the/this/with/use/make/get ...)", () => {
    expect(tokenize("How to use the dashboard with data")).toEqual(["to", "dashboard", "data"]);
    for (const w of ["the", "this", "with", "using", "make", "get"]) {
      expect(tokenize(`alpha ${w} beta`)).not.toContain(w);
    }
    expect(STOPWORDS.has("the")).toBe(true);
  });

  it("drops single-char tokens", () => {
    expect(tokenize("a I x alpha")).toEqual(["alpha"]);
  });

  it("returns [] for empty or all-stopword input", () => {
    expect(tokenize("")).toEqual([]);
    expect(tokenize("the and for with")).toEqual([]);
  });
});

describe("retrieve vectors", () => {
  it("embed is deterministic and VEC_DIM wide", () => {
    const a = embed("postgres row level security policy");
    const b = embed("postgres row level security policy");
    expect(a).toHaveLength(VEC_DIM);
    expect(a).toEqual(b);
  });

  it("embed output is L2-normalized", () => {
    const v = embed("some routing task text here");
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1, 9);
  });

  it("cosine of identical vectors is 1 and differs across topics", () => {
    const a = embed("postgres row level security policy");
    const b = embed("sourdough bread baking recipe");
    expect(cosine(a, a)).toBeCloseTo(1, 9);
    expect(cosine(a, b)).toBeLessThan(0.9);
  });
});
