import { openDb } from "./db.ts";

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
