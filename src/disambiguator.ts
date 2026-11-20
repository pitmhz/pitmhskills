// The disambiguator is machine-readable routing text. Every card writes it
// in the same shape: "<situation> -> this" for the case the card serves, and
// "<other situation> -> <something else>" for the case it does not.
//
//   "General Neon Postgres operations -> this. Branching -> neon-postgres-branches."
//
// The second clause is a NEGATIVE signal. Treating a disambiguator as plain
// text makes the two rival cards symmetric - each one mentions the other's
// name - and the tie then breaks at random.

import { tokenSet, stem } from "./lexicon.ts";
// The disambiguator is machine-readable routing text. Every card writes it
// in the same shape: "<situation> -> this" for the case the card serves, and
// "<other situation> -> <something else>" for the case it does not.
//
//   "General Neon Postgres operations -> this. Branching -> neon-postgres-branches."
//
// The second clause is a NEGATIVE signal. Treating a disambiguator as plain
// text makes the two rival cards symmetric - each one mentions the other's
// name - and the tie then breaks at random.
export interface DisambiguatorClause {
  /** stemmed tokens of the situation part */
  tokens: string[];
  raw: string;
}

export interface Disambiguator {
  positive: DisambiguatorClause[];
  negative: DisambiguatorClause[];
}

export function parseDisambiguator(text: string | undefined | null): Disambiguator {
  const out: Disambiguator = { positive: [], negative: [] };
  const t = (text ?? "").trim();
  if (!t) return out;
  const sentences = t.split(/(?<=\.)\s+/).filter((s) => s.trim().length > 0);
  for (const sentence of sentences) {
    const parts = sentence.split(/\s*->\s*/);
    if (parts.length < 2) {
      // No arrow: the whole line describes when the card applies.
      const tk = [...tokenSet(sentence)];
      if (tk.length) out.positive.push({ tokens: tk, raw: sentence.trim() });
      continue;
    }
    const situation = parts[0] ?? "";
    const target = (parts[1] ?? "").trim();
    const tk = [...tokenSet(situation)];
    if (!tk.length) continue;
    const clause: DisambiguatorClause = { tokens: tk, raw: situation.trim() };
    if (/^this\b/i.test(target)) out.positive.push(clause);
    else out.negative.push(clause);
  }
  return out;
}

