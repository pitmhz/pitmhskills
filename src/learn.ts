import { openDb } from "./db.ts";
import { loadAllCards } from "./retrieve.ts";
import { routeWith } from "./route.ts";
import type { Card } from "./types.ts";
import { existsSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadProfile, saveProfile, profilePath } from "./profile.ts";

export interface PickCount { id: string; count: number }
export interface AskCount { skill_id: string; count: number }
export interface UsageSummary {
  picks: PickCount[];
  asks: AskCount[];
  abstainRate: number;
  total: number;
}

// Read-only over route_logs. Never writes the DB or the profile.
export function summarizeUsage(days = 7): UsageSummary {
  const empty: UsageSummary = { picks: [], asks: [], abstainRate: 0, total: 0 };
  let db: ReturnType<typeof openDb>;
  try {
    db = openDb();
  } catch { return empty; }
  try {
    const cutoff = Date.now() - days * 86400000;
    const rows = db.query<{ outcome: string; skill_id: string | null; n: number }, number>(
      `SELECT outcome, skill_id, COUNT(*) AS n FROM route_logs WHERE ts >= ? GROUP BY outcome, skill_id`
    ).all(cutoff);
    const picks = new Map<string, number>();
    const asks = new Map<string, number>();
    let abstain = 0, total = 0;
    for (const r of rows) {
      total += r.n;
      if (r.outcome === "PICK" && r.skill_id) picks.set(r.skill_id, (picks.get(r.skill_id) ?? 0) + r.n);
      else if (r.outcome === "ASK" && r.skill_id) asks.set(r.skill_id, (asks.get(r.skill_id) ?? 0) + r.n);
      else if (r.outcome === "ABSTAIN") abstain += r.n;
    }
    const byCount = (m: Map<string, number>) => [...m.entries()]
      .map(([id, count]) => ({ id, count }))
      .sort((a, b) => b.count - a.count);
    const askList = [...asks.entries()]
      .map(([skill_id, count]) => ({ skill_id, count }))
      .sort((a, b) => b.count - a.count);
    return { picks: byCount(picks), asks: askList, abstainRate: total ? abstain / total : 0, total };
  } catch { return empty; }
  finally { try { db.close(); } catch { /* ignore */ } }
}

// Structured preferred-boost proposals. Boosts only; never floors or pins.
export interface BoostSuggestion { id: string; boost: number }

export function boostSuggestions(days = 7): BoostSuggestion[] {
  return summarizeUsage(days).picks
    .filter((p) => p.count >= 5)
    .map((p) => ({ id: p.id, boost: 0.1 }));
}

// Copy the live profile to /tmp before any write. Null when no profile.
export function backupProfileToTmp(cwd: string): string | null {
  const pp = profilePath(cwd);
  if (!existsSync(pp)) return null;
  const tmp = join(tmpdir(), `pitmhskills-profile-${Date.now()}.json`);
  copyFileSync(pp, tmp);
  return tmp;
}

// Apply ONLY +0.1 preferred boosts via the existing save path. Returns
// short change lines (capped). No-op (no write) when nothing applies.
export function applyPreferredBoosts(cwd: string, sug: BoostSuggestion[]): string[] {
  const p = loadProfile(cwd);
  if (!p) return [];
  const changed: string[] = [];
  for (const s of sug) {
    if (s.boost !== 0.1 || !s.id) continue;
    const ex = p.preferred.find((e) => e.id === s.id);
    if (ex) {
      const b4 = ex.boost ?? 0.1;
      // Cap: repeat --apply runs must not inflate a boost without bound.
      // Slow creep would pass the tune gate while distorting live retrieval.
      ex.boost = Math.min(0.3, Math.round((b4 + 0.1) * 10) / 10);
      changed.push(`${s.id}: ${b4} -> ${ex.boost}`.slice(0, 160));
    } else {
      p.preferred.push({ id: s.id, boost: 0.1 });
      changed.push(`${s.id}: +0.1 (new)`.slice(0, 160));
    }
  }
  if (changed.length) saveProfile(cwd, p);
  return changed;
}

// Prints human-readable rerank suggestions. Proposes only; never applies.
export function proposeRerank(): string[] {
  const s = summarizeUsage();
  const out: string[] = [];
  if (s.total === 0) {
    const msg = "no route_logs in the last 7 days -> nothing to suggest";
    console.log(msg);
    return [msg];
  }
  for (const p of s.picks) {
    if (p.count >= 5) out.push(`"${p.id}" PICKed ${p.count}x and never wrong -> consider preferred +0.1`);
  }
  for (const a of s.asks) {
    if (a.count >= 3) out.push(`"${a.skill_id}" ASKed ${a.count}x -> needs disambiguator review`);
  }
  if (s.abstainRate > 0.2) out.push(`ABSTAIN rate ${(s.abstainRate * 100).toFixed(1)}% -> coverage gap, review floor or missing skill`);
  if (out.length === 0) out.push("no rerank needed: no frequent PICKs, ASKs, or ABSTAINs");
  for (const line of out) console.log(line);
  return out;
}

if (import.meta.main) {
  console.log(JSON.stringify(summarizeUsage(), null, 2));
  proposeRerank();
}

// Phase 1-Agent A: rival/conflict derivation lives in rivals.ts (keeps this
// file under 200 lines). Re-exported here so the learn flow owns the surface.
export { proposeRivalries, applyRivalries } from "./rivals.ts";
export type { RivalPair, RivalApplyResult } from "./rivals.ts";

// Tier-A promotion gate: candidates and rules only — promotes NOTHING.
// Weights: PICK +2 each (capped at +10 for 5+ PICKs); self-route +5;
// disambiguator present +2; each ASK -3. BLOCKED (sorted last, not
// promotable): license UNKNOWN/empty, or ASK-heavy (>= minAsks) with no
// disambiguator. Deterministic sort: non-blocked first, score desc, id asc.
export interface PromotionCandidate { id: string; score: number; reasons: string[] }
export interface PromotionSignals { picks: number; asks: number; selfRoutes: boolean; licensed: boolean; disambiguator: boolean }

// Pure scorer: takes injected counts so dry tests never touch the DB.
export function scorePromotion(id: string, s: PromotionSignals, minAsks = 3): PromotionCandidate {
  const reasons: string[] = [];
  if (!s.licensed) reasons.push("BLOCKED: license UNKNOWN");
  if (s.asks >= minAsks && !s.disambiguator) reasons.push(`BLOCKED: ASKed ${s.asks}x with no disambiguator`);
  if (s.picks > 0) reasons.push(`PICKed ${s.picks}x`);
  reasons.push(s.selfRoutes ? "self-routes from use_when[0]" : "does not self-route");
  if (s.disambiguator) reasons.push("disambiguator present");
  if (s.asks > 0) reasons.push(`ASKed ${s.asks}x`);
  const score = Math.min(s.picks, 5) * 2 + (s.selfRoutes ? 5 : 0) + (s.disambiguator ? 2 : 0) - s.asks * 3;
  return { id, score, reasons: reasons.map((r) => r.slice(0, 160)) };
}

// Read-only over route_logs + cards. Self-route probes use routeWith with
// lock:false/log:false (no session or log writes). Capped at 20.
export function promoteCandidates(o: { minPicks?: number; minAsks?: number } = {}): PromotionCandidate[] {
  const minPicks = o.minPicks ?? 5;
  const minAsks = o.minAsks ?? 3;
  const usage = summarizeUsage();
  const picks = new Map(usage.picks.map((p) => [p.id, p.count]));
  const asks = new Map(usage.asks.map((a) => [a.skill_id, a.count]));
  let cards: Card[] = [];
  try {
    const db = openDb();
    try { cards = loadAllCards(db); } finally { db.close(); }
  } catch { return []; }
  const cwd = process.cwd();
  const ranked: (PromotionCandidate & { blocked: boolean })[] = [];
  for (const c of cards) {
    if (c.tier !== "B" || c.use_when.length === 0) continue;
    const n = picks.get(c.id) ?? 0;
    if (n < minPicks) continue;
    let self = false;
    try {
      const r = routeWith(c.use_when[0]!, cwd, { sessionId: "cover", lock: false, log: false });
      self = r.skill_id === c.id;
    } catch { self = false; }
    const s = scorePromotion(c.id, {
      picks: n,
      asks: asks.get(c.id) ?? 0,
      selfRoutes: self,
      licensed: !!c.license && c.license !== "UNKNOWN",
      disambiguator: !!(c.disambiguator ?? "").trim(),
    }, minAsks);
    ranked.push({ ...s, blocked: s.reasons.some((r) => r.startsWith("BLOCKED")) });
  }
  ranked.sort((a, b) => Number(a.blocked) - Number(b.blocked) || b.score - a.score || (a.id < b.id ? -1 : 1));
  return ranked.slice(0, 20).map(({ id, score, reasons }) => ({ id, score, reasons }));
}
