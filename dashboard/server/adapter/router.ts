import { rmSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./repo.ts";
import { CMD, run } from "./exec.ts";
import { findCard } from "./skills.ts";

export type RouteResult = {
  outcome: "PICK" | "ASK" | "ABSTAIN" | "LEGACY_LIST";
  picks: { id: string; score: number | null; tier?: string; cluster?: string; reason?: string; bytes?: number }[];
  question?: string;
  dropped?: { id: string; why: string }[];
  bytes_total: number | null;
  skills_loaded: number;
  raw_excerpt: string;
  confidence?: number;
  margin?: number;
  why?: string;
  paired?: string | null;
  ms: number;
};

const SESSION = "dashboard-playground";

type Raw = {
  outcome: "PICK" | "ASK" | "ABSTAIN"; skill_id: string | null; confidence: number; margin: number; body: string;
  why: string; paired?: string | null; ask_question?: string; candidates?: { id: string; score: number; reason: string }[];
};

/** Run the router CLI in JSON mode and normalize. The UI never sees the raw shape. */
export async function routeTask(task: string): Promise<RouteResult> {
  // The dashboard owns this session id; clearing its lock keeps Playground runs independent.
  rmSync(join(ROOT, ".state", `${SESSION}.json`), { force: true });
  const [bin, argv] = CMD.router(task, SESSION);
  const r = await run(bin, argv, { cwd: ROOT, timeout: 60_000, maxBuffer: 16 * 1024 * 1024 });
  const raw_excerpt = (r.stdout || r.stderr).slice(0, 2048);
  let j: Raw;
  try {
    j = JSON.parse(r.stdout) as Raw;
  } catch {
    throw Object.assign(new Error(`router output was not JSON (exit ${r.code})`), { detail: raw_excerpt });
  }
  const join1 = (id: string, score: number | null, reason?: string) => {
    const c = findCard(id);
    return { id, score, reason, tier: c?.tier, cluster: c?.cluster, bytes: c?.core_bytes };
  };
  const picks = (j.candidates ?? []).map((c) => join1(c.id, c.score, c.reason));
  if (j.skill_id && !picks.some((p) => p.id === j.skill_id)) picks.unshift(join1(j.skill_id, j.confidence, j.why));
  if (j.skill_id) picks.sort((a, b) => (a.id === j.skill_id ? -1 : b.id === j.skill_id ? 1 : 0));
  const bytes = j.body ? Buffer.byteLength(j.body) : 0;
  return {
    outcome: j.outcome,
    picks,
    question: j.ask_question,
    dropped: [],
    bytes_total: j.outcome === "ABSTAIN" ? 0 : bytes,
    skills_loaded: j.body ? 1 + (j.paired ? 1 : 0) : 0,
    raw_excerpt,
    confidence: j.confidence,
    margin: j.margin,
    why: j.why,
    paired: j.paired ?? null,
    ms: r.ms,
  };
}
