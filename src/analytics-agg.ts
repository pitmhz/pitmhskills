// Aggregation for the router analytics. Reads skill_offers + skill_usage and
// answers two questions: did the router OFFER the right skill, and was the
// offered skill actually USED.
// Acceptance rule: a PICK offer is accepted when a skill_usage row names the
// same skill_id within 30 minutes. Same session matches; a usage row with no
// session counts as a cross-session match.
import type { Database } from "bun:sqlite";
import { openDb, initDb } from "./db.ts";

const USE_WINDOW_MS = 30 * 60 * 1000;

export interface SkillStat {
  id: string;
  offers: number;
  accepted: number;
  acceptRate: number;
  avgConfidenceAccepted: number;
  avgConfidenceRejected: number;
}
export interface SourceStat { provider: string; offers: number; accepted: number; acceptRate: number }
export interface DroppedStat { id: string; offers: number; rejected: number; rejectRate: number }
export interface LatencyStat { p50: number; p95: number; max: number }
export interface BytesStat { p50: number; p95: number; max: number; avg: number }

export interface Aggregate {
  window: { days: number; since: number };
  offers: {
    total: number;
    byOutcome: { PICK: number; ASK: number; ABSTAIN: number };
    pickRate: number;
    askRate: number;
    abstainRate: number;
  };
  usage: { total: number; acceptedCount: number };
  acceptanceRate: number;
  bySkill: SkillStat[];
  bySource: SourceStat[];
  dropped: DroppedStat[];
  latency: LatencyStat;
  bodyBytes: BytesStat;
  decisionsWithoutOffer: number;
}

interface OfferRow {
  ts: number;
  outcome: string;
  skill_id: string | null;
  confidence: number;
  margin: number;
  body_bytes: number;
  latency_ms: number;
  session_id: string | null;
}
interface UsageRow {
  ts: number;
  session_id: string | null;
  skill_id: string;
  phase: number;
  gates_pass: number;
  slop_pass: number;
  source: string | null;
}

// Nearest-rank percentile over an ascending list. Empty list -> 0.
function pct(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.min(sorted.length - 1, Math.max(0, idx))]!;
}
function mean(xs: number[]): number {
  if (!xs.length) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
function providerOf(id: string): string {
  const i = id.indexOf("__");
  return i > 0 ? id.slice(0, i) : id;
}

// An offer and a usage row match when they name the same skill, sit inside
// the 30 minute window, and share a session (or one of them has no session).
function matches(offer: OfferRow, usage: UsageRow): boolean {
  if (!offer.skill_id || usage.skill_id !== offer.skill_id) return false;
  if (Math.abs(usage.ts - offer.ts) > USE_WINDOW_MS) return false;
  if (!offer.session_id || !usage.session_id) return true;
  return offer.session_id === usage.session_id;
}

function emptyAggregate(days: number): Aggregate {
  return {
    window: { days, since: Date.now() - days * 86400000 },
    offers: {
      total: 0,
      byOutcome: { PICK: 0, ASK: 0, ABSTAIN: 0 },
      pickRate: 0,
      askRate: 0,
      abstainRate: 0,
    },
    usage: { total: 0, acceptedCount: 0 },
    acceptanceRate: 0,
    bySkill: [],
    bySource: [],
    dropped: [],
    latency: { p50: 0, p95: 0, max: 0 },
    bodyBytes: { p50: 0, p95: 0, max: 0, avg: 0 },
    decisionsWithoutOffer: 0,
  };
}

export function aggregate(days = 14, path?: string): Aggregate {
  const cutoff = Date.now() - days * 86400000;
  const out = emptyAggregate(days);
  let db: Database;
  try {
    db = openDb(path);
  } catch { return out; }
  let offers: OfferRow[] = [];
  let usage: UsageRow[] = [];
  try {
    initDb(db);
    offers = db.query<OfferRow, number>(`SELECT ts, outcome, skill_id, confidence, margin, body_bytes, latency_ms, session_id FROM skill_offers WHERE ts >= ?`).all(cutoff);
  } catch { offers = []; }
  try {
    usage = db.query<UsageRow, number>(`SELECT ts, session_id, skill_id, phase, gates_pass, slop_pass, source FROM skill_usage WHERE ts >= ?`).all(cutoff);
  } catch { usage = []; }
  try { db.close(); } catch { /* ignore */ }

  // Outcome split.
  const byOutcome = { PICK: 0, ASK: 0, ABSTAIN: 0 };
  for (const o of offers) {
    if (o.outcome === "PICK") byOutcome.PICK++;
    else if (o.outcome === "ASK") byOutcome.ASK++;
    else if (o.outcome === "ABSTAIN") byOutcome.ABSTAIN++;
  }
  const total = offers.length;
  out.offers.total = total;
  out.offers.byOutcome = byOutcome;
  out.offers.pickRate = total ? byOutcome.PICK / total : 0;
  out.offers.askRate = total ? byOutcome.ASK / total : 0;
  out.offers.abstainRate = total ? byOutcome.ABSTAIN / total : 0;
  out.usage.total = usage.length;

  // Acceptance: only PICK offers carry an offered skill.
  const picks = offers.filter((o) => o.outcome === "PICK" && o.skill_id);
  const skillMap = new Map<string, { offers: number; accepted: number; confAcc: number[]; confRej: number[] }>();
  const sourceMap = new Map<string, { offers: number; accepted: number }>();
  let acceptedCount = 0;
  for (const o of picks) {
    const id = o.skill_id!;
    const accepted = usage.some((u) => matches(o, u));
    if (accepted) acceptedCount++;
    const s = skillMap.get(id) ?? { offers: 0, accepted: 0, confAcc: [], confRej: [] };
    s.offers++;
    if (accepted) { s.accepted++; s.confAcc.push(Number(o.confidence ?? 0)); } else s.confRej.push(Number(o.confidence ?? 0));
    skillMap.set(id, s);
    const src = providerOf(id);
    const p = sourceMap.get(src) ?? { offers: 0, accepted: 0 };
    p.offers++;
    if (accepted) p.accepted++;
    sourceMap.set(src, p);
  }
  out.usage.acceptedCount = acceptedCount;
  out.acceptanceRate = picks.length ? acceptedCount / picks.length : 0;

  out.bySkill = [...skillMap.entries()]
    .map(([id, s]) => ({
      id,
      offers: s.offers,
      accepted: s.accepted,
      acceptRate: s.offers ? s.accepted / s.offers : 0,
      avgConfidenceAccepted: mean(s.confAcc),
      avgConfidenceRejected: mean(s.confRej),
    }))
    .sort((a, b) => b.offers - a.offers || a.id.localeCompare(b.id));

  out.bySource = [...sourceMap.entries()]
    .map(([provider, s]) => ({ provider, offers: s.offers, accepted: s.accepted, acceptRate: s.offers ? s.accepted / s.offers : 0 }))
    .sort((a, b) => b.offers - a.offers || a.provider.localeCompare(b.provider));

  out.dropped = out.bySkill
    .filter((s) => s.accepted < s.offers)
    .map((s) => ({ id: s.id, offers: s.offers, rejected: s.offers - s.accepted, rejectRate: (s.offers - s.accepted) / s.offers }))
    .sort((a, b) => b.rejected - a.rejected || a.id.localeCompare(b.id));

  // Latency and body size over every offer row.
  const lat = offers.map((o) => Number(o.latency_ms ?? 0)).sort((a, b) => a - b);
  const bytes = offers.map((o) => Number(o.body_bytes ?? 0)).sort((a, b) => a - b);
  out.latency = { p50: pct(lat, 50), p95: pct(lat, 95), max: lat.length ? lat[lat.length - 1]! : 0 };
  out.bodyBytes = { p50: pct(bytes, 50), p95: pct(bytes, 95), max: bytes.length ? bytes[bytes.length - 1]! : 0, avg: mean(bytes) };

  // Usage rows the router never offered: the agent used a skill on its own.
  out.decisionsWithoutOffer = usage.filter((u) => !offers.some((o) => matches(o, u))).length;
  return out;
}

export { formatAnalytics } from "./analytics-report.ts";
