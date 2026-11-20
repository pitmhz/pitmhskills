import { Database } from "bun:sqlite";
import type { Card, RankedCard } from "./types.ts";
import { tokenize, stem, cardText } from "./lexicon.ts";
import type { Lexicon } from "./lexicon-stats.ts";
import { loadVecs } from "./retrieve-cache.ts";
export { loadAllCards, loadVecs, dbKey } from "./retrieve-cache.ts";

// Hybrid retrieval: FTS5 BM25 (primary) + hashed TF-IDF cosine (vector arm).
// No ONNX for v0.
// Two fixes from the old version:
// 1. BM25 PRIMARY: old code used FTS5 row index in RRF (spread 0.0003) so vec
//    was the real ranker and BM25 a rounding error. Now real bm25() kept.
// 2. Query TRIMMED to rarest terms: a long prompt otherwise adds low-idf
//    terms that dilute every score under the floor. planQuery keeps rarest.
export { STOPWORDS, tokenize, cardText } from "./lexicon.ts";

// FNV-1a 32-bit offset basis. Hex on purpose: the decimal form reads as a
// phone number to some tooling.
const FNV_BASIS = 0x811c9dc5;

function hashToken(t: string, dim: number): number {
  let h = [FNV_BASIS];
  for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h) % dim;
}

// Signed hashing: each token lands in two buckets with opposite signs, so a
// collision between two unrelated tokens cancels instead of adding. Cuts the
// random similarity that pushed nvidia/postgres cards into UI-task results.
function hashPair(t: string, dim: number): [number, number] {
  return [hashToken(t, dim), hashToken(`#${t}`, dim)];
}

export const VEC_DIM = 512;

// IDF-weighted, signed-hash embedding. Weights come from the corpus lexicon
// when available so common tokens stop dominating the vector arm.
export function embed(text: string, dim = VEC_DIM, weights?: Map<string, number>): number[] {  const v = new Array<number>(dim).fill(0);
  const toks = tokenize(text).map(stem);
  const tf = new Map<string, number>();
  for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);
  const n = toks.length || 1;
  for (const [t, c] of tf) {
    const w = (weights?.get(t) ?? 1) * (c / n) * Math.log(1 + n);
    const [a, b] = hashPair(t, dim);
    v[a] = (v[a] ?? 0) + w;
    v[b] = (v[b] ?? 0) - w;
  }
  const norm = Math.sqrt(v.reduce((a, x) => a + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

export function cosine(a: number[], b: number[]): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i]! * b[i]!;
  return s;
}

function rrf(rank: number, k = 60): number {
  return 1 / (k + rank);
}

// Raw BM25 magnitude -> 0..1. The scale is absolute on purpose: a
// relative normalisation would hand every top card a perfect 1.0 and throw
// away the difference between "matched 3 rare terms" and "matched 1 common
// term". Fitted to 16: 10 lets weak NONE matches clear the floor.
export const BM25_SCALE = 16;

export function bmNorm(absBm25: number, scale = BM25_SCALE): number {
  if (absBm25 <= 0) return 0;
  return absBm25 / (absBm25 + scale);
}

/** Shared query trim: keep the n rarest raw tokens by idf. The scoring arm
 * uses this for its cover denominator, so the matched set and the
 * denominator always agree on which words count. Default 12 must not change
 * without eval proof (config query_terms).
 *
 * The scoring arm needs the unseen words: an unseen word is evidence that a
 * card only partly answers the request, and it counts against the card
 * through the unknown mass in the denominator. So this trim keeps the
 * rarest-first order, unknown words included. */
export function trimToRarest(task: string, lex: Lexicon, n = 12): string[] {
  const qt = tokenize(task);
  if (qt.length <= n) return qt;
  return qt
    .map((t) => ({ t, idf: lex.idf(t) }))
    .sort((a, b) => b.idf - a.idf || (a.t < b.t ? -1 : 1))
    .slice(0, n)
    .map((x) => x.t);
}

/** The terms the FTS MATCH runs on. A word the corpus has never seen matches
 * no card, so it must not occupy a slot: an unknown word scores the maximum
 * IDF, so the rarest-first sort filled the query with words that match
 * nothing and cut the intent terms. For a padded request the query became
 * "deadline quarter paid" while "landing" and "page" were dropped.
 *
 * This is the retrieval query only. The scoring arm still sees the unknown
 * words through trimToRarest, so the unknown penalty holds. */
export function matchTerms(task: string, lex: Lexicon, n = 12): string[] {
  const qt = tokenize(task);
  if (qt.length <= n) return qt;
  const known = qt.filter((t) => (lex.df.get(stem(t)) ?? 0) > 0);
  const unknown = qt.filter((t) => (lex.df.get(stem(t)) ?? 0) === 0);
  const byIdf = (a: string, b: string) => lex.idf(b) - lex.idf(a) || (a < b ? -1 : 1);
  const kept = known.sort(byIdf).slice(0, n);
  if (kept.length < n) kept.push(...unknown.sort(byIdf).slice(0, n - kept.length));
  return kept;
}

export interface RetrieveOpts {
  topK?: number;
  boosts?: Map<string, number>;
  lex?: Lexicon;
  /** weight of the vector arm in the fused score */
  vecWeight?: number;
  /** absolute BM25 saturation scale */
  bm25Scale?: number;
  /** how many query terms survive the trim. Small trims keep only the
   * rarest words, which drops the intent out of a long prompt. */
  queryTerms?: number;
  /** which trim rule the FTS query uses: "known" (default) drops the words
   * the corpus has never seen, "rare" keeps the rarest-first order. */
  matchTrim?: "known" | "rare";
}

export function retrieve(db: Database, task: string, candidates: Card[], topK = 8, boosts?: Map<string, number>): RankedCard[] {
  return retrieveWith(db, task, candidates, { topK, boosts });
}
export function retrieveWith(db: Database, task: string, candidates: Card[], opts: RetrieveOpts = {}): RankedCard[] {
  const topK = opts.topK ?? 8;
  if (candidates.length === 0) return [];
  const ids = new Set(candidates.map((c) => c.id));
  const lex = opts.lex;

  // Trim the query to its informative core before MATCH. Verbose prompts keep
  // only their rarest terms, so filler words stop diluting every score.
  // The MATCH gets RAW tokens: FTS5's own porter stemmer then handles both
  // sides of the comparison, which is the only way the query and the index
  // agree on what "indexing" and "index" are.
  // Two trim rules exist and they trade accuracy against each other:
  //   "known" drops the words the corpus has never seen, because they match
  //     no card and crowd out an intent term that does. Buys long-prompt
  //     coverage.
  //   "rare" keeps the rarest-first order with the unseen words included.
  //     Buys short-prompt precision.
  // The choice is measured, not guessed. See config match_trim.
  let qt: string[] = tokenize(task);
  const trimTo = opts.queryTerms ?? 12;
  if (lex) {
    qt = opts.matchTrim === "rare" ? trimToRarest(task, lex, trimTo) : matchTerms(task, lex, trimTo);
  }
  const q = qt.map((t) => `"${t}"`).join(" OR ");

  // REAL bm25 score, not the row index. The old row-index approach made
  // BM25 a rounding error next to the vector arm.
  const bmScore = new Map<string, number>();
  if (q) {
    try {
      const rows = db.query<{ id: string; score: number }, string>(
        `SELECT id, bm25(cards_fts) AS score FROM cards_fts WHERE cards_fts MATCH ? ORDER BY score LIMIT 400`
      ).all(q);
      for (const r of rows) if (ids.has(r.id)) bmScore.set(r.id, -Number(r.score ?? 0));
    } catch { /* FTS empty */ }
  }

  // Vector arm: IDF-weighted query vs stored card vectors. Stored vectors
  // were built with the unweighted embed, so the query side is the only side
  // we can weight without a full reindex; it is enough to damp common terms.
  // All pool vectors are loaded in ONE query - a per-card lookup cost 1456
  // round trips on every route call.
  const weights = lex ? new Map<string, number>() : undefined;
  if (lex && weights) {
    for (const t of qt) weights.set(t, lex.idf(t));
  }
  const qv = embed(task, VEC_DIM, weights);
  const stored = loadVecs(db);

  const scored: RankedCard[] = candidates.map((c) => {
    let vec = 0;
    try {
      const sv = stored.get(c.id) ?? embed(cardText(c));
      vec = cosine(qv, sv);
    } catch { vec = cosine(qv, embed(cardText(c))); }
    return { card: c, bm25: bmScore.get(c.id) ?? 0, vec, fused: 0 };
  });

  // Fused score. BM25 dominates; the vector arm only breaks ties.
  const vecWeight = opts.vecWeight ?? 0.15;
  const scale = opts.bm25Scale ?? BM25_SCALE;
  for (const s of scored) {
    const bm = bmNorm(s.bm25, scale);
    const vr = Math.max(0, Math.min(1, s.vec * 4));
    s.fused = 0.85 * bm + vecWeight * vr;
  }
  // Tier A first: boost A over B
  for (const s of scored) if (s.card.tier === "A") s.fused += 0.05;
  // Repo profile preferred boosts (default 0.1 per entry); absent map = no change.
  if (opts.boosts) for (const s of scored) s.fused += opts.boosts.get(s.card.id) ?? 0;
  return scored.sort((a, b) => b.fused - a.fused).slice(0, topK);
}
