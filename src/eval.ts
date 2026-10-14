import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { routeWith } from "./route.ts";
import { parseFrontmatter } from "./card.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

interface Golden { task: string; stack?: string[]; expect: string }
interface Scored { top1: number; wrong: number; nonePrec: number; total: number; fails: string[] }

// Eval: top-1 / wrong-skill / NONE precision.
// Tune set = golden.yaml + golden-frontend.yaml (absent file = skip).
// Held-out set = golden-heldout.yaml: never calibrated on, reported only.
export function loadGolden(): Golden[] {
  return loadYaml(join(ROOT, "evals", "golden.yaml"));
}

export function loadHeldout(): Golden[] {
  return loadYaml(join(ROOT, "evals", "golden-heldout.yaml"));
}

export function loadFrontend(): Golden[] {
  return loadYaml(join(ROOT, "evals", "golden-frontend.yaml"));
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

export interface ParserGolden {
  id: string;
  frontmatter: string;
  expect_name?: string;
  expect_contains?: string;
  expect_exact?: string;
  expect_not?: string;
  crlf?: boolean;
}

export function loadParserGoldens(): ParserGolden[] {
  const p = join(ROOT, "evals", "golden-parsers.yaml");
  if (!existsSync(p)) return [];
  const raw = readFileSync(p, "utf8");
  const data = yaml.load(raw) as Record<string, unknown>[] | null;
  if (!Array.isArray(data)) return [];
  return data
    .filter((d) => d && typeof d === "object" && typeof (d as Record<string, unknown>)["frontmatter"] === "string")
    .map((d) => {
      const r = d as Record<string, unknown>;
      return {
        id: String(r["id"] ?? "parser-case"),
        frontmatter: String(r["frontmatter"]),
        expect_name: r["expect_name"] != null ? String(r["expect_name"]) : undefined,
        expect_contains: r["expect_contains"] != null ? String(r["expect_contains"]) : undefined,
        expect_exact: r["expect_exact"] != null ? String(r["expect_exact"]) : undefined,
        expect_not: r["expect_not"] != null ? String(r["expect_not"]) : undefined,
        crlf: r["crlf"] === true,
      };
    });
}

export function runParserGoldens(): { pass: number; total: number; fails: string[] } {
  const cases = loadParserGoldens();
  const fails: string[] = [];
  let pass = 0;
  for (const g of cases) {
    const input = g.crlf ? g.frontmatter.replace(/\n/g, "\r\n") : g.frontmatter;
    const fakePath = `fake/${g.id}/SKILL.md`;
    let got: { name: string; description: string };
    try {
      got = parseFrontmatter(input, fakePath);
    } catch (e) {
      fails.push(`${g.id}: threw ${(e as Error).message}`);
      continue;
    }
    const problems: string[] = [];
    if (g.expect_name !== undefined && got.name !== g.expect_name) {
      problems.push(`name ${JSON.stringify(got.name)} !== ${JSON.stringify(g.expect_name)}`);
    }
    if (g.expect_exact !== undefined && got.description !== g.expect_exact) {
      problems.push(`description ${JSON.stringify(got.description.slice(0, 120))} !== exact ${JSON.stringify(g.expect_exact.slice(0, 120))}`);
    }
    if (g.expect_contains !== undefined && !got.description.includes(g.expect_contains)) {
      problems.push(`description missing ${JSON.stringify(g.expect_contains)} (got ${JSON.stringify(got.description.slice(0, 120))})`);
    }
    if (g.expect_not !== undefined && (got.description === g.expect_not || got.description.includes(g.expect_not) && g.expect_not.length <= 2)) {
      problems.push(`description still corrupted ${JSON.stringify(got.description.slice(0, 40))}`);
    }
    if (problems.length) fails.push(`${g.id}: ${problems.join("; ")}`);
    else pass++;
  }
  return { pass, total: cases.length, fails };
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

export function runEval(cwd: string): Scored & { heldout: Scored; parsers: { pass: number; total: number; fails: string[] } } {
  const tune = scoreSet(loadTune(), cwd);
  const heldout = scoreSet(loadHeldout(), cwd);
  const parsers = runParserGoldens();
  // Gate stays on tune; heldout is information only. Parsers are tune-set members.
  console.log(`tune top1=${(tune.top1 * 100).toFixed(1)}% n=${tune.total}`);
  console.log(`heldout top1=${(heldout.top1 * 100).toFixed(1)}% n=${heldout.total}`);
  console.log(`parsers pass=${parsers.pass}/${parsers.total}`);
  for (const f of parsers.fails.slice(0, 20)) console.log(`PARSER FAIL: ${f}`);
  return { ...tune, heldout, parsers };
}
