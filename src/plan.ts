import { route } from "./route.ts";
import { openDb, initDb, loadConfig } from "./db.ts";
import { loadAllCards } from "./retrieve.ts";

export interface PlanPhase { n: number; skill_id: string; why: string }
export interface Plan { phases: PlanPhase[] }

function domainRank(d: string): number {
  const t = (d ?? "").toLowerCase();
  if (t.includes("data") || t.includes("schema") || t.includes("backend") || t.includes("memory") || t.includes("database") || t.includes("sql")) return 0;
  if (t === "frontend") return 2;
  return 1;
}

// Two-domain tasks -> ordered single-skill phases. Read-only, no ingest.
export function detectPhases(task: string, cwd: string): Plan | null {
  const r = route(task, cwd);
  const cands = (r.candidates ?? []).slice(0, 3);
  if (r.outcome === "ABSTAIN" || cands.length < 2) return null;
  let floor = 60;
  try { floor = loadConfig().floor as number; } catch { floor = 60; }
  const [a, b, c] = [cands[0]!, cands[1]!, cands[2]];
  if (a.score < floor || b.score < floor) return null;
  if (a.score - b.score >= 20) return null;
  let domains = new Map<string, string>();
  try {
    const db = openDb();
    try {
      initDb(db);
      for (const card of loadAllCards(db)) domains.set(card.id, card.domain ?? "");
    } finally { db.close(); }
  } catch { return null; }
  const da = domains.get(a.id) ?? "";
  const db2 = domains.get(b.id) ?? "";
  if (!da || !db2 || da === db2) return null;
  const picked = [a, b];
  if (c && c.score >= floor) {
    const dc = domains.get(c.id) ?? "";
    if (dc && dc !== da && dc !== db2 && a.score - c.score < 20) picked.push(c);
  }
  const ordered = [...picked].sort((x, y) => {
    if (y.score !== x.score) return y.score - x.score;
    return domainRank(domains.get(x.id) ?? "") - domainRank(domains.get(y.id) ?? "");
  });
  return { phases: ordered.slice(0, 3).map((p, i) => ({ n: i + 1, skill_id: p.id, why: p.reason })) };
}
