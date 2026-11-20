// Analytics writes. Two tables, two writers:
//   skill_offers - one row per route decision (what the router offered)
//   skill_usage  - one row per phase close   (what the agent actually used)
// The join between the two gives the acceptance rate: a pick is accepted
// when a usage row names the same skill inside 30 minutes of the offer.
// Writes never throw: an analytics failure must not break a route.
import { createHash } from "node:crypto";
import type { Database } from "bun:sqlite";
import { openDb, initDb } from "./db.ts";
import { aggregate, formatAnalytics } from "./analytics-agg.ts";

export { aggregate, formatAnalytics };
export type { Aggregate, SkillStat, SourceStat, DroppedStat } from "./analytics-agg.ts";

export interface OfferInput {
  task: string;
  outcome: string;
  skillId: string | null;
  confidence: number;
  margin: number;
  candidates: unknown;
  bodyBytes: number;
  latencyMs: number;
  sessionId: string;
  source: string;
  /** Reuse an open handle. When absent the function opens and closes its own. */
  db?: Database;
}

export interface UsageInput {
  sessionId: string;
  skillId: string;
  phase: number;
  gatesPass: boolean | number;
  slopPass: boolean | number;
  source: string;
  /** Reuse an open handle. When absent the function opens and closes its own. */
  db?: Database;
}

// Same hash shape as route.ts route_logs: sha256, first 16 hex chars.
export function taskHash(task: string): string {
  return createHash("sha256").update(task).digest("hex").slice(0, 16);
}

function flag(v: boolean | number | undefined | null): number {
  if (v === undefined || v === null) return 0;
  return v ? 1 : 0;
}

// One skill_offers row. Candidates are stored as a JSON string of the
// ranking slice ({id, score} pairs) so the row stays readable in the DB.
export function recordOffer(o: OfferInput): void {
  try {
    const own = !o.db;
    const db = o.db ?? openDb();
    try {
      if (own) initDb(db);
      db.prepare(
        `INSERT INTO skill_offers (ts, task_hash, outcome, skill_id, confidence, margin, candidates, body_bytes, latency_ms, session_id, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        Date.now(),
        taskHash(o.task ?? ""),
        o.outcome,
        o.skillId ?? null,
        Number(o.confidence ?? 0),
        Number(o.margin ?? 0),
        JSON.stringify(o.candidates ?? []),
        Number(o.bodyBytes ?? 0),
        Number(o.latencyMs ?? 0),
        o.sessionId ?? "default",
        o.source ?? "route",
      );
    } finally {
      if (own) { try { db.close(); } catch { /* ignore */ } }
    }
  } catch { /* analytics must never break a route */ }
}

// One skill_usage row. Written when a phase closes with an active skill.
export function recordUsage(o: UsageInput): void {
  try {
    const own = !o.db;
    const db = o.db ?? openDb();
    try {
      if (own) initDb(db);
      db.prepare(
        `INSERT INTO skill_usage (ts, session_id, skill_id, phase, gates_pass, slop_pass, source)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        Date.now(),
        o.sessionId ?? "default",
        o.skillId,
        Number(o.phase ?? 0),
        flag(o.gatesPass),
        flag(o.slopPass),
        o.source ?? "phase_done",
      );
    } finally {
      if (own) { try { db.close(); } catch { /* ignore */ } }
    }
  } catch { /* analytics must never break a phase close */ }
}
