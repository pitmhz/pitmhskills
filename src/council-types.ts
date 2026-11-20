import type { Card } from "./types.ts";
import type { CouncilNote, Verdict, PersistedCandidate } from "./council-store.ts";

// The shapes the council exchanges. Kept apart from the logic so the
// modules stay small.

export interface CouncilCandidate {
  id: string;
  score: number;
  purpose: string;
  disambiguator: string;
  reason: string;
  /** brief handed to the subagent that reads this one skill */
  brief: string;
}

export interface PlanItem {
  skill_id: string;
  role: "specialist" | "critic";
  prompt: string;
}

export interface Council {
  id: string;
  task: string;
  status: "open" | "decided";
  candidates: CouncilCandidate[];
  /** notes already recorded, keyed by skill id */
  notes: CouncilNote[];
  /**
   * The spawn plan: one prompt per candidate. Full list, in batch order:
   * critic first (when present), then specialists by score desc.
   */
  plan: PlanItem[];
  /**
   * Same list as `plan`, chunked into batches of at most 3 prompts.
   * Process batches in order, record notes per batch, then next batch.
   */
  plan_batches: PlanItem[][];
  expires_at: number;
}

export interface ShortlistEntry {
  card: Card;
  score: number;
  reason: string;
  matched: string[];
}

export interface CouncilOptions {
  sessionId?: string;
  /** how many candidates get a subagent */
  size?: number;
  weights?: import("./weights.ts").Weights;
  /** max bytes a single specialist brief may carry */
  briefBytes?: number;
}

export type { CouncilNote, Verdict, PersistedCandidate };
