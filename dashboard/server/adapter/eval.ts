import { appendFileSync, existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./repo.ts";

export type Split = "train" | "heldout";
export type Case = { task: string; expect: string; split: Split; file: string };

// The repo's own benchmark files. The dashboard appends here; it never keeps a parallel set.
export const EVAL_FILES: Record<Split, string> = {
  train: join(ROOT, "evals", "golden.yaml"),
  heldout: join(ROOT, "evals", "golden-heldout.yaml"),
};
const EXTRA_NONE = join(ROOT, "evals", "golden-adversarial.yaml");

/** Minimal reader for the `- task: ... / expect: ...` list shape used by evals/golden*.yaml. */
export function parseCases(file: string, split: Split): Case[] {
  if (!existsSync(file)) return [];
  const out: Case[] = [];
  let task: string | null = null;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const t = /^-\s+task:\s*(.+)$/.exec(line);
    if (t) { task = unquote(t[1]); continue; }
    const e = /^\s+expect:\s*(.+)$/.exec(line);
    if (e && task !== null) { out.push({ task, expect: unquote(e[1]), split, file }); task = null; }
  }
  return out;
}

function unquote(s: string): string {
  const v = s.replace(/\s+#.*$/, "").trim();
  if (v.startsWith('"')) {
    try { return JSON.parse(v) as string; } catch { return v.slice(1, -1); }
  }
  return v.replace(/^'(.*)'$/, "$1");
}

export function allCases(): Case[] {
  return [...parseCases(EVAL_FILES.train, "train"), ...parseCases(EVAL_FILES.heldout, "heldout")];
}

/** Fixed sample for byte measurement and abstention (deterministic: file order). */
export function sampleQueries(): { pick: Case[]; none: Case[] } {
  const train = parseCases(EVAL_FILES.train, "train");
  const none = [...train, ...parseCases(EXTRA_NONE, "train")].filter((c) => c.expect === "NONE").slice(0, 8);
  return { pick: train.filter((c) => c.expect !== "NONE").slice(0, 12), none };
}

export function appendCase(task: string, expect: string, split: Split): Case {
  const file = EVAL_FILES[split];
  const body = readFileSync(file, "utf8");
  const sep = body.endsWith("\n") ? "" : "\n";
  appendFileSync(file, `${sep}- task: ${JSON.stringify(task)}\n  expect: ${expect}\n`);
  return { task, expect, split, file };
}

/** Last stored benchmark result (root .state/bench). Never runs anything. */
export function lastBench(): { at: string; top1: number; nonePrecision: number; n: number } | null {
  const dir = join(ROOT, ".state", "bench");
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  if (!files.length) return null;
  const latest = files.map((f) => ({ f, t: statSync(join(dir, f)).mtimeMs })).sort((a, b) => b.t - a.t)[0];
  try {
    const j = JSON.parse(readFileSync(join(dir, latest.f), "utf8"));
    return { at: j.meta?.generated_at ?? new Date(latest.t).toISOString(), top1: j.overall?.top1, nonePrecision: j.overall?.nonePrecision, n: j.overall?.n };
  } catch {
    return null;
  }
}
