import type { RankedCard } from "./types.ts";
import { STOPWORDS, stem, synonymsOf, tokens, tokenSet } from "./lexicon.ts";
import { parseDisambiguator } from "./disambiguator.ts";
import { intentClause } from "./intent.ts";
import type { Lexicon } from "./lexicon-stats.ts";
import { bmNorm, BM25_SCALE, trimToRarest } from "./retrieve.ts";
import { predicateMatch, primaryDefaults } from "./collapse.ts";
import { clauseCoverage, longestRun } from "./text-match.ts";
import type { ScoreSignals, ScoredCandidate } from "./scoring-types.ts";
export type { ScoreSignals, ScoredCandidate } from "./scoring-types.ts";
import {
  RARE_DF, PHRASE_BONUS, CLAUSE_BONUS, CLAUSE_PENALTY, NEGATIVE_CLAUSE_FLOOR,
  PREDICATE_BONUS, GENERIC_FACTOR, PRIMARY_DEFAULT_BONUS, positionFactor,
  type Weights,
} from "./weights.ts";

export type { Weights };
export { DEFAULT_WEIGHTS } from "./weights.ts";

// Scoring: raw signals, then a weight set, then a ranking.
//
// The signals are weight-independent so they can be computed once and
// re-scored with any weight set. That is what makes the sweep in
// src/sweep.ts run in seconds instead of hours, and it keeps the weight
// fitting honest: the same signals, only the weights change.

/** Compute the raw signals for a candidate set. */
export function scoreSignals(
  collapsed: RankedCard[],
  task: string,
  lex?: Lexicon,
  rareDf = RARE_DF,
  decay = 0.6
): ScoreSignals[] {
  const rawTaskWords = task.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 0);
  const tl = task.toLowerCase();
  // Shared trimmed core with retrieve: same trimToRarest(task, lex, 12)
  // call, so cover denominator and BM25 see the same informative terms.
  // Content filtering (len>2, no stopword STEM) matches the old ordered
  // list, plus stopword stems are now excluded: "needs" -> "need" is filler
  // and must not count in the denominator.
  let ordered: { w: string; pos: number }[] = [];
  if (lex) {
    const core = trimToRarest(task, lex, 12);
    const seenWord = new Set<string>();
    for (const raw of core) {
      const s = stem(raw);
      if (s.length <= 2 || STOPWORDS.has(s)) continue;
      if (seenWord.has(s)) continue;
      seenWord.add(s);
      ordered.push({ w: s, pos: ordered.length });
    }
    // Fallback for degenerate cores (e.g. task of only stopwords): keep
    // the old behaviour of using the full content list so denom is not 0.
    if (ordered.length === 0) {
      const seen2 = new Set<string>();
      for (const raw of tl.split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOPWORDS.has(w))) {
        const s = stem(raw);
        if (STOPWORDS.has(s) || seen2.has(s)) continue;
        seen2.add(s);
        ordered.push({ w: s, pos: ordered.length });
      }
    }
  } else {
    const seenWord = new Set<string>();
    for (const raw of tl.split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOPWORDS.has(w))) {
      const s = stem(raw);
      if (STOPWORDS.has(s) || seenWord.has(s)) continue;
      seenWord.add(s);
      ordered.push({ w: s, pos: ordered.length });
    }
  }
  // Clause coverage uses the same trimmed core (not the full token list)
  // so clause and cover cannot disagree on which words count.
  const taskTokens = new Set(ordered.map((o) => o.w));

  // The cards that are the default for their category.
  const primaryDefault = primaryDefaults(collapsed, task, lex);

  const out: ScoreSignals[] = collapsed.map((r) => {
    const c = r.card;
    const hay = [c.purpose, c.use_when.join(" "), c.domain, c.task_types.join(" "), c.id.split("__").slice(1).join(" ")].join(" ").toLowerCase();
    // Token-exact cover: substring matching inflates verbose cards
    // ("help" matching "helper") and steals margin from the true pick.
    const hayTokens = tokenSet(hay);

    // Matched query terms, and the idf mass they carry. A query term also
    // matches when the card uses a known synonym of it ("demo" ~ prototype).
    const matched: string[] = [];
    let matchedMass = 0;
    let anySpecific = false;
    let rareHit = false;
    for (const { w, pos } of ordered) {
      const syn = synonymsOf(w);
      const hit = hayTokens.has(w) || [...syn].some((s) => hayTokens.has(s));
      if (!hit) continue;
      matched.push(w);
      const idf = lex ? lex.idf(w) : 1;
      matchedMass += idf * positionFactor(pos, decay);
      if (lex && !lex.isGeneric(w)) anySpecific = true;
      if (lex && (lex.df.get(w) ?? 0) > 0 && (lex.df.get(w) ?? 0) <= rareDf) rareHit = true;
    }
    // Denominator: idf mass of EVERY query content word, including words the
    // corpus has never seen. A word nobody mentions is evidence that a card
    // only partially answers the request, so it must count against the card.
    let denomKnown = 0;
    let unknownCount = 0;
    for (const { w, pos } of ordered) {
      const f = positionFactor(pos, decay);
      if (!lex) { denomKnown += f; continue; }
      if ((lex.df.get(w) ?? 0) > 0) denomKnown += lex.idf(w) * f;
      else unknownCount += f;
    }

    const bm = bmNorm(r.bm25 ?? 0);
    const vec = Math.max(0, Math.min(1, (r.vec ?? 0) * 4));
    // Specificity: a card that matched only generic vocabulary is a
    // coincidence, not a match.
    const genericOnly = lex ? !anySpecific : false;

    const phrase = longestRun(rawTaskWords, new Set(hay.split(/[^a-z0-9]+/).filter((w) => w.length > 0)));
    const phraseBonus = PHRASE_BONUS[Math.min(5, phrase)] ?? 0;

    const pred = predicateMatch(c, task, lex);

    // Intent clause cover. The whole-prompt cover is diluted by the context
    // words of a long request, so the right card's cover falls from 0.904 on
    // the tune set to 0.215 on the long corpora, where a wrong card holds
    // 0.113. Scoring the card against the intent clause alone keeps the
    // signal: 0.273 against 0.091 on the same long cases. It is a separate
    // signal with its own weight, never a gate, because a flat cover floor
    // would drop the NONE cases too.
    const clauseTokens = tokenSet(intentClause(task));
    let clauseHit = 0;
    for (const w of clauseTokens) if (hayTokens.has(w)) clauseHit++;
    const intentCover = clauseTokens.size ? clauseHit / clauseTokens.size : 0;

    // Disambiguator clauses. A positive clause that the task covers is the
    // card saying "this is my case". A negative clause that the task covers
    // is the card saying "not my case".
    const dis = parseDisambiguator(c.disambiguator);
    let clauseBest = 0;
    for (const cl of dis.positive) clauseBest = Math.max(clauseBest, clauseCoverage(cl.tokens, taskTokens));
    let clauseNeg = 0;
    for (const cl of dis.negative) clauseNeg = Math.max(clauseNeg, clauseCoverage(cl.tokens, taskTokens));
    const neg = clauseNeg >= NEGATIVE_CLAUSE_FLOOR ? clauseNeg : 0;

    const reason = matched.length
      ? `matches ${matched.slice(0, 4).map((m) => `"${m}"`).join(", ")} in "${c.purpose.slice(0, 60)}"`
      : `rank match on "${c.purpose.slice(0, 60)}"`;

    return {
      id: c.id,
      bm25: r.bm25 ?? 0,
      bm,
      matchedMass,
      denomKnown,
      unknownCount,
      vec,
      genericOnly,
      clause: clauseBest * CLAUSE_BONUS - neg * CLAUSE_PENALTY,
      phrase,
      phraseBonus,
      predBonus: pred.hit ? PREDICATE_BONUS : 0,
      primaryBonus: primaryDefault.has(c.id) ? PRIMARY_DEFAULT_BONUS : 0,
      variantPenalty: c.cluster_role === "variant" && !pred.hit ? 1 : 0,
      rareHit,
      intentCover,
      matched,
      reason,
    };
  });
  return out;
}

/** Apply a weight set to raw signals and rank them. */
export function applyWeights(
  signals: ScoreSignals[],
  weights: Weights,
  maxIdf = 12,
  bm25Scale = BM25_SCALE
): ScoredCandidate[] {
  return signals
    .map((s, i) => {
      // Cap unknown-word mass: an unseen word is weak evidence, not the
      // strongest signal. min(maxIdf, 4) stops verbose prompts with many
      // unseen words from crushing every cover to 0.
      const denom = s.denomKnown + s.unknownCount * Math.min(maxIdf, 4) * weights.unknown;
      const cover = denom > 0 ? Math.min(1, s.matchedMass / denom) : 0;
      const bm = bmNorm(s.bm25, bm25Scale);
      let score = 100 * (weights.bm25 * bm + weights.cover * cover + weights.vec * s.vec);
      // Rank nudge so a dead heat resolves deterministically. Two points per
      // rank: enough to break a tie, small enough not to distort a real
      // difference.
      score *= Math.max(0.9, 1 - i * 0.02);
      if (s.genericOnly) score *= GENERIC_FACTOR;
      score += s.phraseBonus + s.predBonus + s.clause + s.primaryBonus - s.variantPenalty * weights.variant_unclaimed;
      if (s.rareHit) score += weights.rare_match;
      // Intent clause cover is a separate signal, not part of the whole
      // prompt cover. A long request buries the intent under its context, and
      // this is the term that survives the burial.
      score += s.intentCover * weights.intent_cover;
      return {
        id: s.id,
        score: Math.round(score),
        reason: s.reason,
        matched: s.matched,
        genericOnly: s.genericOnly,
        predicate: s.predBonus > 0,
        phrase: s.phrase,
        detail: { bm, cover, vec: s.vec, clause: s.clause, phraseBonus: s.phraseBonus, predBonus: s.predBonus },
      };
    })
    .sort((a, b) => b.score - a.score);
}
