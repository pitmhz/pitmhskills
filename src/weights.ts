// Weights and the constants that shape the score.
//
// The numbers below were fitted against the tune, held-out and verbose
// golden sets (see src/sweep.ts), not chosen by hand. The raw signals in
// src/scoring.ts do not depend on any of them, so a sweep re-scores cached
// signals instead of re-running retrieval.

export interface Weights {
  /** weight of the FTS5 BM25 signal */
  bm25: number;
  /** weight of the IDF-weighted coverage signal */
  cover: number;
  /** weight of the hashed vector arm */
  vec: number;
  /**
   * How much a query word the corpus has never seen counts against a card.
   * 1 = a word nobody mentions is the strongest possible sign of a bad
   * match. 0 = unknown words are free. Fitted to 1.0 with the capped
   * denominator (min(maxIdf, 4)): unknown mass still counts, but it
   * cannot crush every verbose cover to 0.
   */
  unknown: number;
  /**
   * Penalty for a specialist variant whose own routing predicate does not
   * claim the task. Measured on the golden sets this flipped a CUDA-Q case
   * to the wrong card of the same family, so it ships disabled.
   */
  variant_unclaimed: number;
  /**
   * Bonus for matching a term that is nearly unique in the library. A word
   * held by one or two cards out of 1456 is an identifier, not a topic:
   * "wizard" names exactly one skill.
   */
  rare_match: number;
  /** how many cards may hold a term before it stops counting as unique */
  rare_df: number;
  /**
   * How much later words in the request count for. A request states its
   * intent first and its context afterwards. Fitted to 0.6: with the
   * shared trim core ordered rarest-first, decay weights rare intent
   * higher than common context.
   */
  position_decay: number;
  /**
   * Bonus for covering the intent clause, the first sentence of the
   * request. The whole-prompt cover is diluted by the context words of a
   * long request: the right card's cover falls from 0.904 on the tune set
   * to 0.215 on the long corpora, where a wrong card holds 0.113. The
   * intent clause keeps the signal at 0.273 against 0.091.
   */
  intent_cover: number;
}

export const DEFAULT_WEIGHTS: Weights = {
  bm25: 0.45,
  cover: 0.4,
  vec: 0.05,
  unknown: 1,
  variant_unclaimed: 0,
  rare_match: 0,
  rare_df: 2,
  position_decay: 0.6,
  intent_cover: 0,
};

/** A term held by this many cards or fewer is an identifier, not a topic. */
export const RARE_DF = 2;

/** The first clause of a request carries the intent. */
const INTENT_WORDS = 3;

// Verbatim phrase bonus. BM25 is a bag of words, so it cannot see that the
// task said "animation from scratch" and the card says "Build an animation
// from scratch". A shared run of three or more words is a far stronger
// statement of intent than any single keyword.
export const PHRASE_BONUS: Record<number, number> = { 2: 4, 3: 10, 4: 14, 5: 18 };

// Disambiguator clauses. A positive clause ("Harden a prototype for
// production -> this") that the task matches is a direct statement that
// this card serves this request. The score is the FRACTION of the clause
// that matched, so a short clause that fully matches beats a long clause
// that mostly does not.
//
// A negative clause only punishes when the task really covers it. The
// skill-router card says "Doing the task itself (code, design, docs) ->
// that domain skill". A task containing the word "task" covers 1 token of
// 6 and that is NOT a signal that the router is wrong.
export const CLAUSE_BONUS = 20;
export const CLAUSE_PENALTY = 34;
export const NEGATIVE_CLAUSE_FLOOR = 0.5;

// Flat bonus for a specialist whose pick_over_primary_when predicate really
// matched the task.
export const PREDICATE_BONUS = 14;

/** Cards matching only generic vocabulary get this fraction of their score. */
export const GENERIC_FACTOR = 0.45;

// A cluster's primary is the general skill for its category. A specialist
// variant may take over from it, but only when the variant's own routing
// predicate claims the task.
//
// Tried as a flat bonus for the primary and measured: it pushed NONE cases
// over the floor (a category default is a real card, and real cards score
// points) and did not win the case it was meant for. The real fix is the
// predicate signal itself, not a bonus on the default.
export const PRIMARY_DEFAULT_BONUS = 0;

/** Weight of a query term by where it sits in the request. */
export function positionFactor(pos: number, decay: number): number {
  if (decay <= 0) return 1;
  const over = Math.max(0, pos - INTENT_WORDS);
  return 1 - decay * Math.min(0.75, over / 24);
}
