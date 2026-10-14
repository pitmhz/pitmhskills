import { openDb } from "./db.ts";
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
