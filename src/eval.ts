import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { routeWith } from "./route.ts";
import { openDb, initDb } from "./db.ts";
import { loadAllCards } from "./retrieve.ts";
import { runParserGoldens } from "./eval-parsers.ts";
import type { Card } from "./types.ts";
export { loadParserGoldens, runParserGoldens } from "./eval-parsers.ts";
export type { ParserGolden } from "./eval-parsers.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

interface Golden { task: string; stack?: string[]; expect: string }
interface Scored { top1: number; wrong: number; nonePrec: number; total: number; fails: string[] }

// Eval: top-1 / wrong-skill / NONE precision.
// Tune = golden.yaml + golden-frontend.yaml (absent=skip); heldout never calibrated, reported only.
export function loadGolden(): Golden[] {
  return loadYaml(join(ROOT, "evals", "golden.yaml"));
}

export function loadHeldout(): Golden[] {
  return loadYaml(join(ROOT, "evals", "golden-heldout.yaml"));
}

export function loadFrontend(): Golden[] {
  return loadYaml(join(ROOT, "evals", "golden-frontend.yaml"));
}

/** Long, multi-clause prompts. The class the old scorer failed. */
export function loadVerbose(): Golden[] {
  return loadYaml(join(ROOT, "evals", "golden-verbose.yaml"));
}

/** Paraphrase set: same intent, different words. Report only, not in tune. */
export function loadParaphrase(): Golden[] {
  return loadYaml(join(ROOT, "evals", "golden-paraphrase.yaml"));
}

/** Adversarial NONE set: skill name mentioned but not wanted. Report only. */
export function loadAdversarial(): Golden[] {
  return loadYaml(join(ROOT, "evals", "golden-adversarial.yaml"));
}

export function loadTune(): Golden[] {
  return [...loadGolden(), ...loadFrontend()];
}

function loadYaml(p: string): Golden[] {
  if (!existsSync(p)) return [];
  const raw = readFileSync(p, "utf8");
  const data = yaml.load(raw) as { task?: unknown; stack?: unknown; expect?: unknown }[] | null;
  if (!Array.isArray(data)) return [];
  return data
    .filter((d) => d && typeof d === "object" && typeof (d as Record<string, unknown>)["task"] === "string")
    .map((d) => toGolden(d as Record<string, unknown>));
}

function toGolden(c: Record<string, unknown>): Golden {
  const task = String(c["task"]);
  const expect = c["expect"] != null ? String(c["expect"]) : "NONE";
  const stack = Array.isArray(c["stack"]) ? c["stack"].map(String) : undefined;
  return stack ? { task, stack, expect } : { task, expect };
}

function scoreSet(cases: Golden[], cwd: string): Scored {
  if (cases.length === 0) return { top1: 0, wrong: 0, nonePrec: 1, total: 0, fails: ["no golden cases"] };
  let hit = 0, wrong = 0, noneOk = 0, noneTotal = 0;
  const fails: string[] = [];
  for (const g of cases) {
    // lock:false — eval probes must not consume the shared session lock.
    const r = routeWith(g.task, cwd, { sessionId: "eval", lock: false });
    const got = r.skill_id ?? "NONE";
    if (g.expect === "NONE") {
      noneTotal++;
      if (got === "NONE") { hit++; noneOk++; }
      else { wrong++; fails.push(`NONE expected, got ${got} for "${g.task}"`); }
    } else if (got === g.expect) hit++;
    else { wrong++; fails.push(`expected ${g.expect}, got ${got} for "${g.task}"`); }
  }
  return { top1: hit / cases.length, wrong: wrong / cases.length, nonePrec: noneTotal ? noneOk / noneTotal : 1, total: cases.length, fails };
}

// Self-route coverage: every Tier-A card must route itself from use_when[0].
// Catches retrieval regressions across the library, not just the tune set.
// Info-only; gate stays on tune. --write drafts evals/coverage/*.yaml for hand review.
export function runCoverage(
  cwd: string,
  write = false
): { top1: number; total: number; perSource: Record<string, { hit: number; total: number }>; fails: string[] } {
  const db = openDb();
  initDb(db);
  let cards: Card[] = [];
  try {
    cards = loadAllCards(db);
  } finally {
    db.close();
  }
  const pool = cards.filter((c) => c.tier === "A" && c.use_when.length > 0);
  const perSource = new Map<string, { hit: number; total: number }>();
  const drafts = new Map<string, Golden[]>();
  const fails: string[] = [];
  let hit = 0;
  for (const c of pool) {
    const task = c.use_when[0]!;
    const src = c.id.split("__")[0] ?? "unknown";
    const s = perSource.get(src) ?? { hit: 0, total: 0 };
    s.total++;
    const list = drafts.get(src) ?? [];
    list.push({ task, expect: c.id });
    drafts.set(src, list);
    const r = routeWith(task, cwd, { sessionId: "cover", lock: false, log: false });
    if (r.skill_id === c.id) { hit++; s.hit++; }
    else fails.push(`${c.id} <- "${task.slice(0, 70)}" got ${r.skill_id ?? "NONE"}`);
    perSource.set(src, s);
  }
  if (write) {
    const dir = join(ROOT, "evals", "coverage");
    mkdirSync(dir, { recursive: true });
    for (const [src, items] of drafts) {
      const lines = items.map((g) => `- task: ${JSON.stringify(g.task)}\n  expect: ${g.expect}`);
      writeFileSync(join(dir, `golden-${src}.yaml`), lines.join("\n") + "\n");
    }
  }
  return { top1: pool.length ? hit / pool.length : 0, total: pool.length, perSource: Object.fromEntries(perSource), fails };
}

export function runEval(cwd: string): Scored & {
  heldout: Scored;
  verbose: Scored;
  paraphrase: Scored;
  adversarial: Scored;
  coverage: { top1: number; total: number; perSource: Record<string, { hit: number; total: number }>; fails: string[] };
  parsers: { pass: number; total: number; fails: string[] };
  pass: boolean;
} {
  const tune = scoreSet(loadTune(), cwd);
  const heldout = scoreSet(loadHeldout(), cwd);
  const verbose = scoreSet(loadVerbose(), cwd);
  const paraphrase = scoreSet(loadParaphrase(), cwd);
  const adversarial = scoreSet(loadAdversarial(), cwd);
  const coverage = runCoverage(cwd);
  const parsers = runParserGoldens();
  // Gate is tune top1 plus Tier-A coverage. All other sets are report only.
  // Tune set stays golden.yaml plus golden-frontend.yaml so gates stay comparable.
  const pass = tune.top1 >= 0.8 && coverage.total > 0 && coverage.top1 >= 0.9;
  console.log(`tune top1=${(tune.top1 * 100).toFixed(1)}% n=${tune.total}`);
  console.log(`heldout top1=${(heldout.top1 * 100).toFixed(1)}% n=${heldout.total}`);
  console.log(`verbose top1=${(verbose.top1 * 100).toFixed(1)}% n=${verbose.total}`);
  console.log(`paraphrase top1=${(paraphrase.top1 * 100).toFixed(1)}% n=${paraphrase.total} wrong=${(paraphrase.wrong * 100).toFixed(1)}% none_prec=${(paraphrase.nonePrec * 100).toFixed(1)}%`);
  console.log(`adversarial top1=${(adversarial.top1 * 100).toFixed(1)}% n=${adversarial.total} wrong=${(adversarial.wrong * 100).toFixed(1)}% none_prec=${(adversarial.nonePrec * 100).toFixed(1)}%`);
  console.log(`coverage top1=${(coverage.top1 * 100).toFixed(1)}% n=${coverage.total}`);
  console.log(`parsers pass=${parsers.pass}/${parsers.total}`);
  for (const f of parsers.fails.slice(0, 20)) console.log(`PARSER FAIL: ${f}`);
  for (const f of heldout.fails.slice(0, 20)) console.log(`HELDOUT FAIL: ${f}`);
  for (const f of verbose.fails.slice(0, 20)) console.log(`VERBOSE FAIL: ${f}`);
  for (const f of paraphrase.fails.slice(0, 20)) console.log(`PARAPHRASE FAIL: ${f}`);
  for (const f of adversarial.fails.slice(0, 20)) console.log(`ADVERSARIAL FAIL: ${f}`);
  for (const f of coverage.fails.slice(0, 20)) console.log(`COVERAGE FAIL: ${f}`);
  return { ...tune, heldout, verbose, paraphrase, adversarial, coverage, parsers, pass };
}
