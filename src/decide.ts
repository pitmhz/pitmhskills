import type { RankedCard } from "./types.ts";
import { STOPWORDS } from "./retrieve.ts";

// Score 0-100 from fused rank signal + lexical fit. Deterministic, no LLM on hot path.
// Function words (STOPWORDS in retrieve.ts) carry no routing signal but inflate
// cover for verbose cards, so they are excluded from the overlap count.
export function scoreCandidates(collapsed: RankedCard[], task: string): { id: string; score: number; reason: string }[] {
  const tl = task.toLowerCase();
  const out = collapsed.map((r, i) => {
    const c = r.card;
    const hay = [c.purpose, c.use_when.join(" "), c.domain, c.task_types.join(" ")].join(" ").toLowerCase();
    // Token-exact cover: substring matching inflates verbose cards
    // ("help" matching "helper") and steals margin from the true pick.
    const hayTokens = new Set(hay.split(/[^a-z0-9]+/).filter((w) => w.length > 0));
    const words = new Set(tl.split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOPWORDS.has(w)));
    let overlap = 0;
    for (const w of words) if (hayTokens.has(w)) overlap++;
    const cover = words.size ? overlap / words.size : 0;
    const rankDecay = Math.max(0, 1 - i * 0.12);
    const vecpart = Math.max(0, Math.min(1, r.vec * 4));
    const score = Math.round(100 * (0.25 * rankDecay + 0.55 * cover + 0.2 * vecpart));
    return { id: c.id, score, reason: `matches "${c.purpose.slice(0, 80)}"` };
  });
  return out.sort((a, b) => b.score - a.score);
}

export function decide(
  ranking: { id: string; score: number; reason: string }[],
  collapsed: RankedCard[],
  floor: number,
  margin: number,
  pickFloor: number
): { outcome: "PICK" | "ASK" | "ABSTAIN"; top: (typeof ranking)[number] | null; second: (typeof ranking)[number] | null } {
  if (ranking.length === 0) return { outcome: "ABSTAIN", top: null, second: null };
  const top = ranking[0]!;
  const second = ranking[1] ?? null;
  if (top.score < floor) return { outcome: "ABSTAIN", top, second };
  const m = second ? top.score - second.score : 99;
  if (top.score >= pickFloor && m >= margin) return { outcome: "PICK", top, second };
  if (top.score >= floor && m >= margin) return { outcome: "PICK", top, second };
  if (top.score >= floor && second && m < margin) {
    void collapsed;
    return { outcome: "ASK", top, second };
  }
  return { outcome: "ABSTAIN", top, second };
}

export function buildAskQuestion(top: RankedCard, second: RankedCard): string {
  const a = top.card.disambiguator || top.card.purpose;
  const b = second.card.disambiguator || second.card.purpose;
  return `Two skills fit. Which matches? 1) ${top.card.id}: ${a} 2) ${second.card.id}: ${b} Reply 1 or 2.`;
}
