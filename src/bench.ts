// Bench harness for the two long corpora.
// Question: does the router offer the right skill, and is it efficient?
// Run: bun src/bench.ts [--corpus <name>] [--json] [--out <path>]
//   --corpus  digital-product | cybersec   (default: both)
//   --json    print the report as JSON on stdout instead of text
//   --out     path for the JSON file (default .state/bench/bench-<timestamp>.json)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { routeWith } from "./route.ts";
import { buildReport, classify, formatText, type BenchCase, type CaseResult, type Check, type Report } from "./bench-report.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CWD = ROOT; // the router reads the repo profile and signals from cwd
const CORPORA = [
  { name: "digital-product", file: "golden-long-digital-product.yaml" },
  { name: "cybersec", file: "golden-long-cybersec.yaml" },
];

/** Load a corpus file. Same shape as src/eval.ts loadYaml, plus category and
 *  expect_any: the cards that also answer the task when the expected one is not
 *  the single right card. */
function loadCases(file: string): BenchCase[] {
  if (!existsSync(file)) return [];
  const data = yaml.load(readFileSync(file, "utf8")) as unknown;
  if (!Array.isArray(data)) return [];
  const out: BenchCase[] = [];
  for (const d of data) {
    if (!d || typeof d !== "object") continue;
    const c = d as Record<string, unknown>;
    if (typeof c["task"] !== "string") continue;
    const stack = Array.isArray(c["stack"]) ? (c["stack"] as unknown[]).map(String) : undefined;
    const alt = Array.isArray(c["expect_any"]) ? (c["expect_any"] as unknown[]).map(String).filter(Boolean) : [];
    out.push({ task: String(c["task"]), expect: c["expect"] != null ? String(c["expect"]) : "NONE",
      expect_any: alt, category: c["category"] != null ? String(c["category"]) : "unknown", ...(stack ? { stack } : {}) });
  }
  return out;
}

/** Near-miss table from evals/long-corpora-notes.md. corpus -> case no -> expect id. */
function loadNearMiss(file: string): Map<string, Map<number, string>> {
  const out = new Map<string, Map<number, string>>();
  if (!existsSync(file)) return out;
  let key = "";
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const h3 = line.match(/^###\s+(.+?)\s*$/);
    if (h3) {
      const t = h3[1]!.toLowerCase();
      key = t.startsWith("digital") ? "digital-product" : t.startsWith("cyber") ? "cybersec" : "";
      continue;
    }
    if (line.startsWith("## ")) { key = ""; continue; }
    if (!key) continue;
    const m = line.match(/^\|\s*(\d+)\s*\|\s*([^|]*?)\s*\|\s*`([^`]+)`\s*\|/);
    if (!m) continue;
    const map = out.get(key) ?? new Map<number, string>();
    map.set(Number(m[1]), m[3]!);
    out.set(key, map);
  }
  return out;
}

/** One route call, measured. lock and log are off: no session lock, no route_logs. */
function runCase(c: BenchCase, corpus: string, idx: number): CaseResult {
  const t0 = performance.now();
  const r = routeWith(c.task, CWD, { sessionId: "bench", lock: false, log: false });
  const latencyMs = performance.now() - t0;
  const candidates = (r.candidates ?? []).map((x) => ({ id: x.id, score: x.score }));
  const at = candidates.findIndex((x) => x.id === c.expect);
  const gap = candidates.length >= 2 ? candidates[0]!.score - candidates[1]!.score : null;
  const body = r.body ?? "";
  const alt = c.expect_any ?? [];
  return {
    idx, corpus, outcome: r.outcome, skill_id: r.skill_id, confidence: r.confidence, margin: r.margin,
    candidates, bodyBytes: Buffer.byteLength(body, "utf8"), bodyWords: body.trim() ? body.trim().split(/\s+/).length : 0,
    expect: c.expect, expect_any: alt, hit: classify(r.outcome, r.skill_id, c.expect, alt),
    category: c.category, taskWords: c.task.trim().split(/\s+/).length, latencyMs,
    must_delegate: r.must_delegate === true, proceed_bare_allowed: r.proceed_bare_allowed === true,
    block_reason: r.block_reason ?? "", expectRank: at < 0 ? null : at + 1, candGap: gap,
  };
}

/** Field by field comparison of two runs of the same case. */
function diff(a: CaseResult, b: CaseResult): string | null {
  if (a.outcome !== b.outcome) return `outcome ${a.outcome} vs ${b.outcome}`;
  if (a.skill_id !== b.skill_id) return `skill ${a.skill_id} vs ${b.skill_id}`;
  if (a.confidence !== b.confidence) return `confidence ${a.confidence} vs ${b.confidence}`;
  if (a.margin !== b.margin) return `margin ${a.margin} vs ${b.margin}`;
  const x = a.candidates.map((c) => c.id).join(">");
  const y = b.candidates.map((c) => c.id).join(">");
  if (x !== y) return `candidates ${x} vs ${y}`;
  return null;
}

function compare(a: CaseResult[], b: CaseResult[]): Check {
  const detail: string[] = [];
  for (const x of a) {
    const y = b.find((z) => z.corpus === x.corpus && x.idx === z.idx);
    if (!y) { detail.push(`${x.corpus}#${x.idx} missing in second run`); continue; }
    const d = diff(x, y);
    if (d) detail.push(`${x.corpus}#${x.idx} ${d}`);
  }
  return { checked: a.length, mismatches: detail.length, detail };
}

function parseArgs(argv: string[]): { corpus: string | null; json: boolean; out: string | null } {
  let corpus: string | null = null;
  let json = false;
  let out: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--json") json = true;
    else if (a === "--corpus") corpus = argv[++i] ?? null;
    else if (a.startsWith("--corpus=")) corpus = a.slice(9);
    else if (a === "--out") out = argv[++i] ?? null;
    else if (a.startsWith("--out=")) out = a.slice(6);
  }
  return { corpus, json, out };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const wanted = args.corpus
    ? CORPORA.filter((c) => c.name === args.corpus || c.file.startsWith(args.corpus!) || c.name.includes(args.corpus!))
    : CORPORA;
  if (!wanted.length) {
    console.error(`no corpus matches ${args.corpus}. known: ${CORPORA.map((c) => c.name).join(", ")}`);
    process.exit(2);
  }
  const corpora = wanted.map((c) => {
    const cases = loadCases(join(ROOT, "evals", c.file));
    return { name: c.name, file: c.file, cases, results: [] as CaseResult[] };
  });
  const total = corpora.reduce((a, c) => a + c.cases.length, 0);
  if (!total) {
    console.error("no cases found. corpus files are missing.");
    process.exit(2);
  }
  // Pass 1: forward order. Pass 2: same order again. Pass 3: reverse order.
  const pass1: CaseResult[] = [];
  for (const c of corpora) for (let i = 0; i < c.cases.length; i++) pass1.push(runCase(c.cases[i]!, c.name, i + 1));
  const pass2: CaseResult[] = [];
  for (const c of corpora) for (let i = 0; i < c.cases.length; i++) pass2.push(runCase(c.cases[i]!, c.name, i + 1));
  const rev: CaseResult[] = [];
  for (const c of corpora) for (let i = c.cases.length - 1; i >= 0; i--) rev.push(runCase(c.cases[i]!, c.name, i + 1));
  const determinism = { second_pass: compare(pass1, pass2), reverse: compare(pass1, rev) };
  for (const c of corpora) {
    c.results = pass1.filter((r) => r.corpus === c.name);
  }
  const report: Report = buildReport({
    cwd: CWD,
    corpusFilter: args.corpus,
    routeCalls: pass1.length + pass2.length + rev.length,
    corpora,
    nearMiss: loadNearMiss(join(ROOT, "evals", "long-corpora-notes.md")),
    determinism,
  });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = args.out ?? join(ROOT, ".state", "bench", `bench-${stamp}.json`);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n");
  if (args.json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(formatText(report));
    console.log("");
    console.log(`json written to ${outPath}`);
  }
}

main();
