// The ABSTAIN branch of the router, split out of src/route.ts to keep every
// file under the 200 line cap.
//
// An ABSTAIN is the honest answer when no card clears the floor. The branch
// also carries the gate contract for a harness: is a council worth opening, or
// may the agent proceed bare? The bar is the near_floor. A candidate far
// below the floor is noise, and blocking on noise stops the agent from doing
// work that needs no skill at all.

import type { RouteResult } from "./types.ts";

export interface NearCandidate {
  id: string;
  score: number;
  reason: string;
}

/**
 * Build the ABSTAIN result.
 * A council is worth opening only when the best near candidate reaches the
 * near_floor. Below that bar the task needs no skill and the agent may
 * proceed bare.
 */
export function abstainResult(o: {
  candidates: NearCandidate[];
  topScore: number;
  topId: string | null;
  floor: number;
  nearFloor: number;
}): RouteResult {
  const near = o.candidates.slice(0, 3);
  const bestNear = near.length ? near[0]!.score : 0;
  const nearRelevant = bestNear >= o.nearFloor;
  const blockReason = nearRelevant
    ? `ABSTAIN with a near candidate (${near[0]!.id} ${bestNear} >= near_floor ${o.nearFloor}) - call council(task) to decide, do not proceed bare`
    : `proceed bare allowed: no candidate near floor (best ${bestNear} < near_floor ${o.nearFloor})`;
  return {
    outcome: "ABSTAIN",
    skill_id: null,
    confidence: o.topScore,
    margin: 0,
    body: "",
    scope_fence: "Only touch files the task names.",
    verify: [],
    why: o.topId ? `top ${o.topId} score ${o.topScore} < floor ${o.floor}` : "no candidates",
    candidates: near,
    council_hint: nearRelevant ? "close candidates exist: call council(task) to let one reader per candidate decide" : "",
    locked: false,
    must_delegate: nearRelevant,
    proceed_bare_allowed: !nearRelevant,
    block_reason: blockReason,
  };
}
