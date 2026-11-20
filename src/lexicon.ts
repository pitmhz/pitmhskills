// Corpus lexicon: tokenization, light stemming, stopwords, and BM25 IDF over
// the card corpus.
//
// Every ranking decision needs to know how RARE a word is across the whole
// library. A card that matches only "build", "page" or "form" is not evidence
// of relevance - those words appear in hundreds of cards. A card that matches
// "wizard" is. IDF is the only way to tell those apart, and the old scorer
// had no such signal: it counted raw token overlap, so verbose cards and
// generic matches both won.
//

import type { Card } from "./types.ts";
import { SYNONYM_GROUPS } from "./lexicon-synonyms.ts";
export { SYNONYM_GROUPS } from "./lexicon-synonyms.ts";

// English filler and dev-filler words. These are not stopwords in the
// classical sense: they carry meaning in a sentence, but they carry no
// ROUTING signal. "too many client components" must not match a card that
// says "too" and "many". Deliberately conservative - only words that are
// generic in English, never words that name a technique, a tool, a format
// or a domain.
const FILLER = [
  "too", "very", "quite", "rather", "fairly", "really", "actually", "generally",
  "typically", "usually", "ever", "yet", "however", "though", "although",
  "plus", "onto", "upon", "among", "despite", "besides", "meanwhile", "thus",
  "hence", "thereby", "unless", "until", "during", "above", "below", "under",
  "over", "again", "once", "twice", "stuff", "lot", "lots", "bit", "bits",
  "let", "lets", "per", "via", "onto", "into", "onto", "worth", "able",
  "need", "want", "try", "asked", "asking", "put", "set", "run", "ran",
  "give", "given", "take", "taken", "come", "came", "go", "going", "went",
  "know", "known", "think", "thought", "see", "seen", "look", "looked",
  "want", "wanted", "start", "started", "begin", "began", "show", "shown",
  "work", "works", "worked", "working",
  "match", "matches", "matched", "matching", "registered", "register",
];

export const STOPWORDS = new Set([
  "the", "and", "for", "with", "this", "that", "these", "those", "from", "your",
  "you", "are", "was", "were", "will", "would", "can", "could", "should", "may",
  "might", "must", "have", "has", "had", "been", "its", "into", "about", "over",
  "how", "what", "when", "why", "who", "which", "their", "there", "here", "some",
  "use", "using", "make", "get", "set",
  "does", "more", "same", "then", "gives", "than", "such", "only", "just", "very",
  "much", "many", "most", "other", "like", "well", "also", "always", "never", "often",
  "every", "thing", "things", "without", "within", "while", "across", "another", "along",
  "around", "such", "need", "want", "try", "add", "new", "one", "two", "way", "ways",
  "call", "calls", "called", "via", "per", "etc", "let", "lets", "now", "still",
  "back", "each", "both", "any", "all", "itself", "him", "her", "them", "some",
  ...FILLER,
]);

// Stemmer: plural forms, verb forms, and the trailing-e rule. Both sides of
// every comparison go through it, so "hardening" matches "harden" and
// "animations" matches "animate". The old matcher only handled plurals,
// which left a task saying "harden these GitHub Actions workflows" unable
// to match a card whose only mention of the word is "hardening".
export function stem(t: string): string {
  let s = t;
  // plural
  if (s.length > 4 && s.endsWith("ies")) s = s.slice(0, -3) + "y";
  else if (s.length > 4 && (s.endsWith("ches") || s.endsWith("shes") || s.endsWith("xes") || s.endsWith("zes") || s.endsWith("sses"))) s = s.slice(0, -2);
  else if (s.length > 3 && s.endsWith("s") && !s.endsWith("ss") && !s.endsWith("us") && !s.endsWith("is")) s = s.slice(0, -1);
  // verb
  if (s.length > 5 && s.endsWith("ing")) {
    let b = s.slice(0, -3);
    if (/(.)\1$/.test(b)) b = b.slice(0, -1); // running -> run
    else if (s.endsWith("eing")) b = b.slice(0, -1); // making -> make
    s = b;
  } else if (s.length > 4 && s.endsWith("ed")) {
    let b = s.slice(0, -2);
    if (/(.)\1$/.test(b)) b = b.slice(0, -1); // stopped -> stop
    s = b;
  }
  // -ion nouns: animation -> animate
  if (s.length > 5 && s.endsWith("ion")) s = s.slice(0, -3);
  // -ly adverbs: stealthily -> stealth
  if (s.length > 6 && s.endsWith("ly")) s = s.slice(0, -2);
  // trailing e: create -> creat, code -> cod
  if (s.length >= 4 && s.endsWith("e")) s = s.slice(0, -1);
  return s;
}

export function tokenize(s: string): string[] {
  const out: string[] = [];
  // Split on whitespace first so a compound identifier keeps its parts.
  for (const word of s.toLowerCase().split(/\s+/)) {
    const parts = word.split(/[^a-z0-9]+/).filter((p) => p.length > 0);
    for (const p of parts) {
      if (p.length <= 1 || STOPWORDS.has(p)) continue;
      out.push(p);
    }
    // Identifier-shaped compound: "CUDA-Q", "GPT-4", "T4-7". Joined so the
    // library's "cudaq" and the user's "CUDA-Q" are the same token. A plain
    // hyphenated phrase ("shared-memory") is left alone - joining it would
    // invent a word nobody used.
    if (parts.length >= 2 && parts.length <= 3 && parts.some((p) => p.length <= 2)) {
      const joined = parts.join("");
      if (joined.length >= 4 && !STOPWORDS.has(joined)) out.push(joined);
    }
  }
  return out;
}

// Words that are one identifier written several ways: "CUDA-Q" and "cudaq"
// are the same technology, and the library may use either. Token-exact
// matching sees "cuda" and "cudaq" as different words, so a task naming
// "CUDA-Q" never matched the cudaq guide. tokenize() already emits the
// joined form of identifier-shaped compounds, so nothing else is needed
// here.
export function expandCompounds(words: string[]): string[] {
  return [];
}

/** Tokenize, then add compound identifiers. */
export function tokens(s: string): string[] {
  return tokenize(s);
}

/** Stemmed token set. Token-exact, no substring matching. */
export function tokenSet(s: string): Set<string> {
  const out = new Set<string>();
  for (const t of tokens(s)) out.add(stem(t));
  return out;
}

const SYNONYMS = new Map<string, Set<string>>();
for (const g of SYNONYM_GROUPS) {
  // Key by stem: callers always pass stems (scoring ordered terms, clause
  // tokens), but the groups list raw surface forms ("templated",
  // "onboarding"). Keying by the raw form made those two bridges never
  // fire (synonymsOf("templat") was empty). Stem-keying makes the match
  // symmetric: "templat" finds "slop", "onboard" finds "wizard".
  const stems = [...new Set(g.map(stem))];
  for (const s of stems) {
    const set = SYNONYMS.get(s) ?? new Set<string>();
    for (const o of stems) if (o !== s) set.add(o);
    SYNONYMS.set(s, set);
  }
}

/** Synonyms of one token, stemmed. Empty when the token has none. */
export function synonymsOf(token: string): Set<string> {
  const s = SYNONYMS.get(stem(token));
  if (!s) return new Set();
  return new Set(s);
}

export function cardText(c: Card): string {
  return [c.purpose, c.domain, c.task_types.join(" "), c.use_when.join(" "), c.goal ?? "", (c.when_to_use ?? []).join(" ")].join("\n");
}

// Everything about a card that says WHEN to use it.
export function routingText(c: Card): string {
  return [
    c.purpose,
    c.goal ?? "",
    c.use_when.join(" "),
    (c.when_to_use ?? []).join(" "),
    c.domain,
    c.task_types.join(" "),
    c.id.split("__").slice(1).join(" "),
  ].join(" ");
}

