// The intent clause: the part of a request that says what the work is.
//
// A long request states its intent first and its context afterwards:
// "Our landing page is slow on mobile data and the first thing we hear is
// that the page is spinning, which is costing us signups. The team is three
// people and none of us have done this before, so please explain the
// reasoning as you go."
//
// The whole-prompt cover treats all of that as one bag of words, so the
// intent is diluted by the context and the score of the right card falls
// below the floor. Measured: the right card's cover is 0.904 on the tune
// set and 0.215 on the long corpora, where a wrong card holds 0.113. The
// intent clause alone separates them: 0.273 against 0.091 on long-d.
//
// The clause is the first sentence, or the first 12 content words when the
// request has no sentence break. It is a pure function of the task text.

import { STOPWORDS, stem } from "./lexicon.ts";

/** How many content words the intent clause holds when there is no sentence break. */
export const INTENT_CLAUSE_WORDS = 12;

/**
 * Extract the intent clause from a request.
 * The first sentence when the request has one, otherwise the first
 * INTENT_CLAUSE_WORDS content words.
 */
export function intentClause(task: string): string {
  const first = task.split(/(?<=[.!?])\s+/)[0] ?? task;
  const words = first
    .split(/\s+/)
    .map((w) => w.replace(/[^A-Za-z0-9'-]/g, ""))
    .filter((w) => w.length > 2 && !STOPWORDS.has(stem(w.toLowerCase())));
  return words.length ? words.slice(0, INTENT_CLAUSE_WORDS).join(" ") : first;
}
