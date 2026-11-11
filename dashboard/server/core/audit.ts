import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { CONFIG_FILE, STATE, readJson, mtime } from "../adapter/repo.ts";
import { cardSig, hasProvenance, loadCards, validation } from "../adapter/skills.ts";
import { lastBench, sampleQueries } from "../adapter/eval.ts";
import { routeTask } from "../adapter/router.ts";
import { agentFiles } from "../adapter/mandate.ts";

type Measure = { key: string; at: string; avg: number; max: number; perTask: number; abstain: number; noneN: number; n: number };
const MEASURE_FILE = join(STATE, "cache", "bytes.json");
let running: Promise<void> | null = null;

const measureKey = () => `${cardSig()}|${mtime(CONFIG_FILE)}`;

/** Route the fixed sample through the router (sequential, unique sessions). Cached until cards or config change. */
async function measure(key: string) {
  const { pick, none } = sampleQueries();
  const bytes: number[] = [];
  let loaded = 0, abst = 0;
  for (const c of pick) {
    const r = await routeTask(c.task).catch(() => null);
    if (!r) continue;
    bytes.push(r.bytes_total ?? 0);
    loaded += r.skills_loaded;
  }
  for (const c of none) {
    const r = await routeTask(c.task).catch(() => null);
    if (r?.outcome === "ABSTAIN") abst++;
  }
  const m: Measure = {
    key, at: new Date().toISOString(), n: bytes.length, noneN: none.length,
    avg: bytes.length ? Math.round(bytes.reduce((a, b) => a + b, 0) / bytes.length) : 0,
    max: Math.max(0, ...bytes), perTask: bytes.length ? loaded / bytes.length : 0,
    abstain: none.length ? abst / none.length : 0,
  };
  writeFileSync(MEASURE_FILE, JSON.stringify(m, null, 2));
}

function measured(fresh: boolean): { m: Measure | null; measuring: boolean } {
  const key = measureKey();
  const m = readJson<Measure | null>(MEASURE_FILE, null);
  const valid = m && m.key === key && !fresh;
  if (!valid && !running) running = measure(key).finally(() => (running = null));
  return { m, measuring: !!running };
}

export async function audit(fresh = false) {
  const cards = loadCards();
  const v = await validation();
  const cfg = readJson<Record<string, number>>(CONFIG_FILE, {});
  const tiers: Record<string, number> = {};
  let noProv = 0, returnableNoProv = 0, staleA = 0;
  for (const c of cards) {
    tiers[c.tier] = (tiers[c.tier] ?? 0) + 1;
    const ret = c.tier !== "C";
    if (!hasProvenance(c)) { noProv++; if (ret) returnableNoProv++; }
    if (c.tier === "A" && v.bad.get(c.id)?.some((e) => e.startsWith("stale"))) staleA++;
  }
  let stale = 0, invalid = 0;
  for (const errs of v.bad.values()) errs.some((e) => e.startsWith("stale")) ? stale++ : invalid++;
  const agents = agentFiles().map((f) => ({ file: f.rel, bytes: f.bytes }));
  const { m, measuring } = measured(fresh);
  return {
    total: cards.length,
    tiers,
    returnable: cards.length - (tiers.C ?? 0),
    frozen: tiers.C ?? 0,
    no_provenance: noProv,
    returnable_no_provenance: returnableNoProv,
    stale, stale_a: staleA, invalid,
    validator: { code: v.code, at: new Date(v.at).toISOString(), excerpt: v.raw.split("\n").slice(0, 3) },
    always_on: { min: Math.min(...agents.map((a) => a.bytes)), max: Math.max(...agents.map((a) => a.bytes)), files: agents },
    budget: { always_on_target: 600, always_on_cap: 1024, max_bytes: cfg.max_bytes ?? null, avg_bytes_target: cfg.avg_bytes_target ?? null, max_skills_per_task: cfg.max_skills_per_task ?? null },
    per_task: m ? { avg: m.avg, max: m.max, skills: m.perTask, n: m.n, at: m.at, stale: m.key !== measureKey() } : null,
    abstention: m ? { rate: m.abstain, n: m.noneN } : null,
    measuring,
    bench: lastBench(),
  };
}
