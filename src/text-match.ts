import { STOPWORDS, synonymsOf } from "./lexicon.ts";

// Text matching helpers shared by the scorer.

/** Fraction of a clause's tokens that the task covers. */
export function clauseCoverage(clauseTokens: string[], taskTokens: Set<string>): number {
  if (!clauseTokens.length) return 0;
  let hit = 0;
  for (const t of clauseTokens) {
    if (taskTokens.has(t)) { hit++; continue; }
    for (const s of synonymsOf(t)) if (taskTokens.has(s)) { hit++; break; }
  }
  return hit / clauseTokens.length;
}

/** Longest contiguous run of MEANINGFUL task words that also occur in the
 * card text. Function words are skipped without breaking the run, so
 * "profile a cuda kernel" counts as three words, but a run of pure filler
 * ("a", "the", "with") never counts. */
export function longestRun(taskWords: string[], cardWords: Set<string>): number {
  let best = 0;
  let cur = 0;
  for (const w of taskWords) {
    const filler = w.length <= 2 || STOPWORDS.has(w);
    if (filler) continue;
    if (cardWords.has(w)) {
      cur++;
      if (cur > best) best = cur;
    } else cur = 0;
  }
  return best;
}
