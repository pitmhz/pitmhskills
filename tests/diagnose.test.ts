import { describe, it, expect } from "bun:test";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runDiagnose } from "../src/diagnose.ts";

// Read-only over the default DB paths: two runs, zero writes, byte-identity only.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("diagnose determinism", () => {
  it("same task twice is byte-identical", () => {
    const task = "fix postgres row level security policy";
    const first = runDiagnose(task, ROOT);
    const second = runDiagnose(task, ROOT);
    expect(second).toBe(first);
    expect(first.length).toBeGreaterThan(0);
  });

  it("trace covers every pipeline stage", () => {
    const out = runDiagnose("review the dashboard code", ROOT);
    for (const marker of ["TASK:", "GATE DROPS", "RETRIEVAL", "COLLAPSE WINNERS", "DECISION:", "SECTIONS", "TEACHES:"]) {
      expect(out).toContain(marker);
    }
  });

  it("different tasks trace differently (sanity: output depends on input)", () => {
    const a = runDiagnose("fix postgres row level security policy", ROOT);
    const b = runDiagnose("bake sourdough bread", ROOT);
    expect(a).not.toBe(b);
  });
});
