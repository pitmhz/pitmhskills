import type { RankedCard, Card } from "./types.ts";
import { STOPWORDS, stem, tokenSet } from "./lexicon.ts";
import { parseDisambiguator } from "./disambiguator.ts";
import type { Lexicon } from "./lexicon-stats.ts";

// Shortlist: turn a deep ranked pool into a small, diverse candidate set.
//
// The old rule was "one candidate per cluster". Clusters are CATEGORIES, not
// rivalry groups: "frontend-design" held 88 distinct skills, "general" held
// 428. One-per-cluster meant only one frontend-design skill could ever be
// considered, so near-synonyms such as uiskills-staged__harden and
// kemiljk-skills__prototype-to-production could never compete - the router
// picked one by a loose keyword predicate and the other was invisible.
//
// The new rules:
//   1. near-duplicate cards collapse (same provider + same purpose).
//   2. a category may hold several candidates, but only a few. This is the
//      anti-flood rule: nvidia and postgres can no longer fill the list.
//   3. CLUSTER ARBITRATION: a category's primary is the default. A
//      specialist variant joins the shortlist only when it CLAIMS the task
//      through its own routing text - its pick_over_primary_when predicate
//      or its disambiguator's positive clause. A variant that does not
//      claim the task is not a candidate for it, however well it matches
//      lexically.
//
// Rule 3 is the old "one per cluster" rule with the claim test fixed. The
// old test was "does any predicate token appear in the task", and the
// winner was then decided by the hash-vector ordering - which is why a
// landing-page specialist whose predicate says "SaaS offer hierarchy pacing"
// used to answer a plain "design a landing page for a repair shop".

export interface PredicateMatch {
  /** true when the predicate is a real signal for this task */
  hit: boolean;
  matched: string[];
  rare: string[];
}

// A single common word ("direction", "design", "error") is not a routing
// signal - it fires on half the library. Two matched tokens, or one rare
// token, is. Skill-name tokens alone do not count: mentioning "ponytail"
// must not claim ponytail-help. Keys that are part of the card's own id
// are ignored for the match count, so a birthday plan that mentions the
// skill name does not get the variant bonus.
export function predicateMatch(card: Card, task: string, lex?: Lexicon): PredicateMatch {
  const cond = (card.pick_over_primary_when ?? "").toLowerCase().trim();
  if (!cond) return { hit: false, matched: [], rare: [] };
  const keys = cond.split(/[^a-z0-9]+/).filter((w) => w.length > 3 && !STOPWORDS.has(w));
  if (keys.length === 0) return { hit: false, matched: [], rare: [] };
  const taskTokens = new Set(task.toLowerCase().split(/[^a-z0-9]+/).map(stem).filter((w) => w.length > 0));
  const matched = keys.filter((k) => taskTokens.has(stem(k)));
  if (matched.length === 0) return { hit: false, matched: [], rare: [] };
  const idTokens = new Set(
    card.id.split("__").slice(1).join(" ").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2).map(stem)
  );
  const nonId = matched.filter((k) => !idTokens.has(stem(k)));
  const rare = nonId.filter((k) => !lex || !lex.isGeneric(k));
  // Single-key predicates (figjam, slides) keep the old rule: the one
  // key is the whole signal. Otherwise require a non-id match.
  const hit = keys.length <= 1 ? matched.length >= 1 : nonId.length >= 2 || rare.length >= 1;
  return { hit, matched, rare };
}

/** True when the card's own routing text says it is the skill for this task:
 * either its pick_over_primary_when predicate or its disambiguator's
 * positive clause ("<situation> -> this"). */
export function claimsTask(card: Card, task: string, lex?: Lexicon): boolean {
  if (card.cluster_role !== "variant") return true; // primaries are always eligible
  if (predicateMatch(card, task, lex).hit) return true;
  const dis = parseDisambiguator(card.disambiguator);
  const taskTokens = new Set(task.toLowerCase().split(/[^a-z0-9]+/).map(stem).filter((w) => w.length > 0));
  for (const cl of dis.positive) {
    let hit = 0;
    for (const t of cl.tokens) if (taskTokens.has(t)) hit++;
    // A clause that is mostly covered is a real claim.
    if (hit / Math.max(1, cl.tokens.length) >= 0.5) return true;
  }
  return false;
}

/**
 * The cards that are the default for their category: a cluster's primary
 * when no specialist in that cluster claims the task.
 */
export function primaryDefaults(collapsed: RankedCard[], task: string, lex?: Lexicon): Set<string> {
  const groupPrimary = new Map<string, string>();
  const claimed = new Set<string>();
  for (const r of collapsed) {
    const cl = r.card.cluster?.trim();
    if (!cl) continue;
    if (r.card.cluster_role !== "variant" && !groupPrimary.has(cl)) groupPrimary.set(cl, r.card.id);
  }
  for (const r of collapsed) {
    if (r.card.cluster_role === "variant" && predicateMatch(r.card, task, lex).hit) claimed.add(r.card.cluster?.trim() ?? "");
  }
  const out = new Set<string>();
  for (const [cl, id] of groupPrimary) if (!claimed.has(cl)) out.add(id);
  return out;
}

function purposeKey(c: Card): string {
  const p = c.purpose.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").slice(0, 10).join(" ");
  return `${c.id.split("__")[0] ?? "?"}|${p}`;
}

export interface ShortlistOpts {
  /** candidates kept per category */
  maxPerCluster?: number;
  /** total candidates kept */
  maxTotal?: number;
  /** task, for the predicate and claim checks */
  task?: string;
  lex?: Lexicon;
  /** drop specialists that do not claim the task. Off by default: measured
   * worse on the golden sets. */
  enforceClaims?: boolean;
}

export interface Shortlist {
  kept: RankedCard[];
  /** category -> number of candidates dropped by the diversity cap */
  capped: Record<string, number>;
  /** cards dropped as near-duplicates */
  deduped: string[];
  /** cards dropped because they did not claim the task */
  unclaimed: string[];
}

export function shortlist(ranked: RankedCard[], opts: ShortlistOpts = {}): Shortlist {
  const maxPerCluster = opts.maxPerCluster ?? 3;
  const maxTotal = opts.maxTotal ?? 24;
  const out: RankedCard[] = [];
  const deduped: string[] = [];
  const unclaimed: string[] = [];
  const capped: Record<string, number> = {};
  const seenPurpose = new Set<string>();
  const perCluster = new Map<string, number>();
  // The pool arrives in retrieval order, but the shortlist is a selection,
  // not a pass-through: sort by fused so the strongest card is always first.
  const pool = [...ranked].sort((a, b) => b.fused - a.fused);

  // Cluster arbitration: a category's primary is the default, and a
  // specialist variant only joins when it claims the task.
  //
  // Enforced as a hard drop this measured WORSE (tune 97.8% vs 98.9%): the
  // library has clusters with several primaries and variants that are the
  // right answer without claiming the task (neondatabase__neon-postgres for
  // a generic Neon query, supabase__supabase-postgres-best-practices for
  // RLS). The rule is kept because the council uses it to explain WHY a
  // specialist was preferred, but the shortlist does not enforce it.
  const groupPrimary = new Map<string, string>();
  const claimants = new Set<string>();
  if (opts.task) {
    for (const r of pool) {
      const cl = r.card.cluster?.trim();
      if (!cl) continue;
      if (r.card.cluster_role !== "variant" && !groupPrimary.has(cl)) groupPrimary.set(cl, r.card.id);
    }
    for (const r of pool) {
      if (r.card.cluster_role === "variant" && claimsTask(r.card, opts.task, opts.lex)) claimants.add(r.card.id);
    }
  }
  const enforce = opts.enforceClaims === true;

  for (const r of pool) {
    const key = purposeKey(r.card);
    if (seenPurpose.has(key)) { deduped.push(r.card.id); continue; }
    seenPurpose.add(key);
    const cl = r.card.cluster?.trim() || `solo:${r.card.id}`;
    // A variant that does not claim the task is not a candidate for it.
    if (enforce && opts.task && r.card.cluster_role === "variant" && !claimants.has(r.card.id)) {
      const isPrimary = groupPrimary.get(cl) === r.card.id;
      if (!isPrimary) { unclaimed.push(r.card.id); continue; }
    }
    const n = perCluster.get(cl) ?? 0;
    if (n >= maxPerCluster) { capped[cl] = (capped[cl] ?? 0) + 1; continue; }
    perCluster.set(cl, n + 1);
    out.push(r);
    if (out.length >= maxTotal) break;
  }
  return { kept: out, capped, deduped, unclaimed };
}
