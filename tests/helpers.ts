import type { Card, RankedCard } from "../src/types.ts";

export function mkCard(over: Partial<Card> & { id: string }): Card {
  return {
    tier: "B",
    origin: [],
    license: "MIT",
    hash: "",
    purpose: `${over.id} purpose`,
    domain: "general",
    task_types: ["implement"],
    use_when: [`Use when ${over.id}`],
    do_not_use_when: [`Do not use ${over.id} for unrelated work`],
    scope: `${over.id} scope`,
    cluster: "",
    cluster_role: "primary",
    ...over,
  };
}

export function mkRanked(card: Card, fused = 1, vec = 0.1, bm25 = 0): RankedCard {
  return { card, bm25, vec, fused };
}
