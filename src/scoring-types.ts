// The shapes the scorer exchanges. Kept apart from the logic so the
// modules stay small.

/** Raw per-card signals. Weight-independent. */
export interface ScoreSignals {
  id: string;
  /** raw FTS5 bm25 magnitude, so the saturation scale stays sweepable */
  bm25: number;
  bm: number;
  /** idf mass the card matched */
  matchedMass: number;
  /** idf mass of the query words the corpus knows */
  denomKnown: number;
  /** how many query words the corpus has never seen */
  unknownCount: number;
  vec: number;
  genericOnly: boolean;
  clause: number;
  phrase: number;
  phraseBonus: number;
  predBonus: number;
  /** bonus for being the category default when no specialist claims the task */
  primaryBonus: number;
  /** penalty for a variant that did not claim the task */
  variantPenalty: number;
  /** the card matched a term that is nearly unique in the library */
  rareHit: boolean;
  /** how much of the intent clause the card covers, 0 to 1. The intent clause
   * is the first sentence of the request, so this signal survives a long
   * prompt where the whole-prompt cover is diluted by the context. */
  intentCover: number;
  matched: string[];
  reason: string;
}

export interface ScoredCandidate {
  id: string;
  score: number;
  reason: string;
  matched: string[];
  genericOnly: boolean;
  predicate: boolean;
  phrase: number;
  detail: { bm: number; cover: number; vec: number; clause: number; phraseBonus: number; predBonus: number; intentCover: number };
}
