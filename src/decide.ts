import type { RankedCard } from "./types.ts";
import type { Lexicon } from "./lexicon-stats.ts";
import { scoreSignals, applyWeights, DEFAULT_WEIGHTS, type Weights, type ScoredCandidate } from "./scoring.ts";

// The decision: score the candidates, then turn the ranking into an
// outcome. Scoring itself lives in src/scoring.ts.
//
// The old scorer was: cover = |task words n card words| / |ALL task words|,
// mixed with a rank decay. Two things broke it:
//
// 1. It divided by every task word, so a long prompt needed the card to
//    contain a big fraction of ALL its words. Verbose prompts diluted
//    themselves under the floor and the router said ABSTAIN even when the
//    right skill was an obvious match.
// 2. It had no notion of word rarity. A card matching only "build", "form"
//    and "step" scored the same as a card matching "wizard".

export function scoreCandidates(
  collapsed: RankedCard[],
  task: string,
  lex?: Lexicon,
  weights: Weights = DEFAULT_WEIGHTS,
  terms?: number
): ScoredCandidate[] {
  return applyWeights(scoreSignals(collapsed, task, lex, weights.rare_df, weights.position_decay, terms), weights, lex?.maxIdf ?? 12);
}

export function decide(
  ranking: { id: string; score: number; reason: string }[],
  collapsed: RankedCard[],
  floor: number,
  margin: number,
  pickFloor: number,
  askMinMargin = 3
): { outcome: "PICK" | "ASK" | "ABSTAIN"; top: (typeof ranking)[number] | null; second: (typeof ranking)[number] | null } {
  if (ranking.length === 0) return { outcome: "ABSTAIN", top: null, second: null };
  const top = ranking[0]!;
  const second = ranking[1] ?? null;
  if (top.score < floor) return { outcome: "ABSTAIN", top, second };
  const m = second ? top.score - second.score : 99;
  // One margin, one meaning: the leader must beat the runner up by margin to
  // commit. The old rule had a second absolute gate, pick_floor, which was
  // fitted on ten word prompts. A long request that matches perfectly scores
  // 50 to 77, so pick_floor turned correct leaders into questions. Measured
  // over the golden sets: 151 correct commits with no margin floor rule, 134
  // with a margin of 15, and only 1 wrong commit at margin 15 against 5 at
  // margin 10. The margin is the signal that separates a clear leader from a
  // coin toss, and it does not depend on how long the request is.
  if (m >= margin) return { outcome: "PICK", top, second };
  // A lone candidate has a margin of 99 by convention: there is no runner up
  // to be ahead of. When the caller demands more than 99, no candidate can
  // satisfy it, so the answer is ABSTAIN and never ASK: a question needs two
  // options, and with one candidate there is nothing to choose between.
  if (!second) return { outcome: "ABSTAIN", top, second };
  // Two cards that are nearly tied are noise, not a contest. Asking the user
  // to choose between them wastes a turn, and on a task where no skill
  // applies it turns a clean abstain into a wrong suggestion. Below
  // ask_min_margin the leader is not a leader, so the answer is ABSTAIN.
  // The candidates still travel with the result, so a harness can open a
  // council when one is genuinely near the floor.
  if (m < askMinMargin) return { outcome: "ABSTAIN", top, second };
  // Contested: two cards are close, so a reader or a council decides, not a
  // guess. pickFloor now marks a strong contest in the reason, so an agent
  // sees that the leader was high scoring even though it lost the margin.
  void collapsed;
  const noted = top.score >= pickFloor
    ? { ...top, reason: `${top.reason} (strong contest, leader ${top.score})` }
    : top;
  return { outcome: "ASK", top: noted, second };
}

export function buildAskQuestion(top: RankedCard, second: RankedCard): string {
  const a = top.card.disambiguator || top.card.purpose;
  const b = second.card.disambiguator || second.card.purpose;
  return `Two skills fit. Which matches? 1) ${top.card.id}: ${a} 2) ${second.card.id}: ${b} Reply 1 or 2.`;
}
