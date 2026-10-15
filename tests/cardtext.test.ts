import { describe, it, expect } from "bun:test";
import {
  slug,
  guessDomain,
  guessTaskTypes,
  mineUseWhen,
  extractKeywords,
  extractSections,
  specFrontmatter,
} from "../src/cardtext.ts";

describe("cardtext slug", () => {
  it("lowercases, dashes runs, trims, caps at 60", () => {
    expect(slug("Hello World!")).toBe("hello-world");
    expect(slug("  --A  B-- ")).toBe("a-b");
    expect(slug("x".repeat(100)).length).toBeLessThanOrEqual(60);
  });

  it("falls back to 'skill' on empty input", () => {
    expect(slug("")).toBe("skill");
    expect(slug("!!!")).toBe("skill");
  });
});

describe("cardtext guessDomain", () => {
  it("routes infra keywords to cloudflare-edge", () => {
    expect(guessDomain("deploy worker to cloudflare with kv")).toBe("cloudflare-edge");
    expect(guessDomain("check the waf rules")).toBe("cloudflare-edge");
  });

  it("word boundaries stop embedded matches: 'knowledge' is not edge-compute", () => {
    expect(guessDomain("search my knowledge base")).toBe("general");
  });

  // Resolved: \bedge\b dropped — generic prose wins over the bare word;
  // edge-compute routing requires an infra marker (worker/cloudflare/kv/d1/r2/waf).
  it("edge-cases prose does not match edge-compute", () => {
    expect(guessDomain("handle edge cases in validation logic")).toBe("general");
  });

  it("routes data, frontend, gpu, memory, workflow keywords", () => {
    expect(guessDomain("fix postgres rls policy")).toBe("backend-data");
    expect(guessDomain("build react dashboard ui")).toBe("frontend");
    expect(guessDomain("run cuda kernels on nvidia gpu")).toBe("gpu-compute");
    expect(guessDomain("cavemem retrieval over past sessions")).toBe("memory");
    expect(guessDomain("triage the spec ticket")).toBe("workflow");
  });

  it("falls back to general", () => {
    expect(guessDomain("bake sourdough bread")).toBe("general");
  });
});

describe("cardtext guessTaskTypes", () => {
  it("detects each type and defaults to implement", () => {
    expect(guessTaskTypes("review the code")).toContain("review");
    expect(guessTaskTypes("refactor this module")).toContain("refactor");
    expect(guessTaskTypes("build a new page")).toContain("implement");
    expect(guessTaskTypes("debug the crash")).toContain("debug");
    expect(guessTaskTypes("design the layout")).toContain("design");
    expect(guessTaskTypes("bake sourdough bread")).toEqual(["implement"]);
  });

  it("collects multiple types", () => {
    expect(guessTaskTypes("review and fix the build")).toEqual(
      expect.arrayContaining(["review", "debug"]),
    );
  });
});

describe("cardtext mineUseWhen", () => {
  it("keeps the description first and mines trigger lines", () => {
    const out = mineUseWhen(
      "Intro line\nUse when: writing postgres RLS policies for multi-tenant apps\nTail",
      "short desc",
    );
    expect(out[0]).toBe("short desc");
    expect(out).toContain("writing postgres RLS policies for multi-tenant apps");
  });

  it("mines 'triggers on' and 'should be used when' variants", () => {
    const out = mineUseWhen(
      "Triggers on: nightly edge cache purge duties for zones\nShould be used when handling refund disputes with customers",
      "desc",
    );
    expect(out.length).toBeGreaterThan(1);
  });

  it("ignores lines that are too short and caps at 4 entries", () => {
    const lines = Array.from(
      { length: 6 },
      (_, i) => `Use when: numbered trigger case ${i} with enough padding text here`,
    );
    const out = mineUseWhen(lines.join("\n"), "desc");
    expect(out).toHaveLength(4);
    expect(out[0]).toBe("desc");
  });

  it("returns just the description when nothing matches", () => {
    expect(mineUseWhen("plain body, no triggers", "desc")).toEqual(["desc"]);
  });
});

describe("cardtext extractKeywords", () => {
  it("takes distinctive heading words only, not body prose", () => {
    const out = extractKeywords("# Hello World Authentication Tokens\nbody mention zebra", "hello");
    expect(out).toContain("world");
    expect(out).toContain("authentication");
    expect(out).toContain("tokens");
    expect(out).not.toContain("zebra");
    expect(out).not.toContain("hello"); // covered text excluded
  });

  it("skips stopwords, short tokens, dedupes, caps at 12", () => {
    const raw = ["# The Quick Brown Fox", "# The Quick Brown Fox", "# " + "word ".repeat(30)].join(
      "\n",
    );
    const out = extractKeywords(raw, "");
    expect(out).not.toContain("the");
    expect(out.length).toBeLessThanOrEqual(12);
    expect(new Set(out).size).toBe(out.length);
  });

  it("returns [] when there are no headings", () => {
    expect(extractKeywords("plain body text", "")).toEqual([]);
  });
});

describe("cardtext extractSections", () => {
  it("maps ## and ### headings with byte sizes and when-words", () => {
    const raw = "## Alpha Section\ntext here\n### Beta Detail\nmore text\n## Gamma Part\ntail";
    const secs = extractSections(raw);
    expect(secs.map((s) => s.name)).toEqual(["Alpha Section", "Beta Detail", "Gamma Part"]);
    for (const s of secs) {
      expect(s.bytes).toBeGreaterThan(0);
      expect(s.when.length).toBeLessThanOrEqual(8);
    }
    expect(secs[0]!.when).toContain("alpha");
  });

  it("ignores single-# titles and returns [] for headingless text", () => {
    expect(extractSections("# Title only\nbody")).toEqual([]);
    expect(extractSections("no headings here")).toEqual([]);
  });
});

describe("cardtext specFrontmatter", () => {
  it("emits the Agent Skills interop subset with the first 3 use_when", () => {
    const fm = specFrontmatter({
      name: "demo",
      description: "demo desc",
      license: "MIT",
      use_when: ["one", "two", "three", "four"],
    });
    expect(fm).toContain('name: "demo"');
    expect(fm).toContain('when_to_use: "one; two; three"');
    expect(fm).not.toContain("four");
    expect(fm).toContain('compatibility: "pitmhskills"');
    expect(fm).toContain('source: "pitmhskills"');
    expect(fm.startsWith("---\n")).toBe(true);
    expect(fm.endsWith("\n---")).toBe(true);
  });
});
