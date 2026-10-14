import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { routeWith } from "./route.ts";

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
  const out: Golden[] = [];
  let cur: Record<string, string> = {};
  for (const ln of raw.split("\n")) {
    const t = ln.match(/^\s*-\s*task:\s*"?(.*?)"?\s*$/);
    if (t) { if (cur["task"]) out.push(toGolden(cur)); cur = { task: t[1]! }; continue; }
    const e = ln.match(/^\s*expect:\s*(\S+)/);
    if (e && cur["task"]) cur["expect"] = e[1]!;
  }
  if (cur["task"]) out.push(toGolden(cur));
  return out;
}

function toGolden(c: Record<string, string>): Golden {
  return { task: c["task"]!, expect: c["expect"] ?? "NONE" };
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

export function runEval(cwd: string): Scored & { heldout: Scored } {
  const tune = scoreSet(loadTune(), cwd);
  const heldout = scoreSet(loadHeldout(), cwd);
  // Gate stays on tune; heldout is information only.
  console.log(`tune top1=${(tune.top1 * 100).toFixed(1)}% n=${tune.total}`);
  console.log(`heldout top1=${(heldout.top1 * 100).toFixed(1)}% n=${heldout.total}`);
  return { ...tune, heldout };
}
