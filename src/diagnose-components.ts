import type { RankedCard } from "./types.ts";
import type { ScoredCandidate } from "./scoring.ts";

// Component table for the diagnose trace: which signal carried the score.
// This is the view that makes a bad route debuggable - without it the score
// is a number with no explanation.

export function componentLines(ranking: ScoredCandidate[], collapsed: RankedCard[]): string[] {
  const byId = new Map(collapsed.map((r) => [r.card.id, r]));
  const out = ["COMPONENTS:"];
  for (const s of ranking.slice(0, 5)) {
    const r = byId.get(s.id);
    const bm = r ? r.bm25.toFixed(1) : "-";
    const d = s.detail;
    out.push(`  ${s.id} score=${s.score} bm=${bm} cover=${d.cover.toFixed(2)} vec=${d.vec.toFixed(2)} clause=${d.clause.toFixed(0)} phrase=${s.phrase}(${d.phraseBonus}) pred=${d.predBonus} gen=${s.genericOnly ? "Y" : "n"}`);
    out.push(`      matched: ${s.matched.join(",")}`);
  }
  return out;
}
