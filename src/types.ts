// Card schema - single source of truth, one file per skill in cards/
// Zod schemas double as docs; validateCard/validateProfile derive from them.
import { z } from "zod";

export const CardSectionSchema = z.object({
  name: z.string(),
  bytes: z.number(),
  when: z.array(z.string()),
});
export interface CardSection {
  name: string;
  bytes: number;
  when: string[];
}

export interface Card {
  id: string; // <provider>__<name>
  tier: "A" | "B" | "C";
  origin: string[]; // repo@sha
  license: string;
  hash: string; // sha256 of SKILL.md
  purpose: string;
  domain: string;
  task_types: string[];
  use_when: string[];
  do_not_use_when: string[];
  scope: string;
  disambiguator?: string;
  cluster?: string;
  cluster_role?: "primary" | "variant";
  pick_over_primary_when?: string | null;
  pairs_with?: string | null;
  requires?: { stack_any?: string[]; files_any?: string[] };
  conflicts_with?: string[];
  keywords?: string[];
  curated?: boolean; // hand-curated text: builder never overwrites, reports stale instead
  body_tokens?: number;
  core_bytes?: number;
  sections?: CardSection[];
  verify?: string[];
  skill_path?: string; // local path to raw SKILL.md
  goal?: string; // v2: one-line outcome the skill delivers (max 200 chars)
  when_to_use?: string[]; // v2 alias-safe supplement to use_when (cap 5)
  when_not_to_use?: string[]; // v2 supplement to do_not_use_when
  provides?: string[]; // v2: top heading n-grams / section names (cap 3)
  example?: string; // v2: concise usage example
  counter_example?: string; // v2: concise anti-example
}

export interface Signals {
  stack: string[];
  files: string[];
}

export interface RankedCard {
  card: Card;
  bm25: number;
  vec: number;
  fused: number;
}

export interface RouteResult {
  outcome: "PICK" | "ASK" | "ABSTAIN";
  skill_id: string | null;
  confidence: number;
  margin: number;
  body: string;
  scope_fence: string;
  verify: string[];
  why: string;
  locked: boolean;
  paired?: string | null; // pairs_with / ponytail guard delivered with the pick
  ask_question?: string;
  candidates?: { id: string; score: number; reason: string }[];
  /** set when a council would resolve this better than a guess */
  council_hint?: string;
  /** true when the caller must delegate (council or user pick) before work */
  must_delegate?: boolean;
  /** true only when proceeding bare (no skill) is allowed */
  proceed_bare_allowed?: boolean;
  /** what must happen next when must_delegate is true; empty when not blocked */
  block_reason?: string;
}

export const CardSchema = z.object({
  id: z.string().min(1),
  tier: z.enum(["A", "B", "C"]),
  origin: z.array(z.string()).optional().default([]),
  license: z.string().optional().default("UNKNOWN"),
  hash: z.string().optional().default(""),
  purpose: z.string().min(1),
  domain: z.string().min(1),
  task_types: z.array(z.string()).min(1),
  use_when: z.array(z.string()).min(1),
  do_not_use_when: z.array(z.string()).min(1),
  scope: z.string().min(1),
  disambiguator: z.string().optional().default(""),
  cluster: z.string().optional().default(""),
  cluster_role: z.enum(["primary", "variant"]).optional().default("primary"),
  pick_over_primary_when: z.string().nullable().optional().default(null),
  pairs_with: z.union([z.string(), z.array(z.string()), z.null()]).optional().default(null),
  requires: z
    .object({ stack_any: z.array(z.string()).optional(), files_any: z.array(z.string()).optional() })
    .passthrough()
    .optional()
    .default({}),
  conflicts_with: z.array(z.string()).optional().default([]),
  keywords: z.array(z.string()).optional().default([]),
  curated: z.boolean().optional().default(false),
  body_tokens: z.number().optional(),
  core_bytes: z.number().optional(),
  sections: z.array(CardSectionSchema).optional().default([]),
  verify: z.array(z.string()).optional().default([]),
  skill_path: z.string().optional().default(""),
  goal: z.string().optional().default(""),
  when_to_use: z.array(z.string()).optional().default([]),
  when_not_to_use: z.array(z.string()).optional().default([]),
  provides: z.array(z.string()).optional().default([]),
  example: z.string().optional().default(""),
  counter_example: z.string().optional().default(""),
}).superRefine((c, ctx) => {
  if (c.tier === "A" && (c.use_when.length < 2 || c.do_not_use_when.length < 1)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "tier A needs use_when+do_not_use_when", path: ["use_when"] });
  }
  if (c.tier === "A" && (!c.goal || !String(c.goal).trim() || !c.disambiguator || !String(c.disambiguator).trim() || !c.example || !String(c.example).trim() || !c.counter_example || !String(c.counter_example).trim())) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "tier A needs goal+disambiguator+example+counter_example", path: ["goal"] });
  }
  if (c.cluster_role === "variant" && !c.pick_over_primary_when) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "variant needs pick_over_primary_when", path: ["pick_over_primary_when"] });
  }
  if (Array.isArray(c.pairs_with) && c.pairs_with.length > 1) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "pairs_with max 1", path: ["pairs_with"] });
  }
});

export type CardSchemaType = z.infer<typeof CardSchema>;

export function validateCard(c: unknown): string[] {
  const r = CardSchema.safeParse(c);
  if (r.success) return [];
  const out: string[] = [];
  const required = new Set(["id", "tier", "purpose", "domain", "task_types", "use_when", "do_not_use_when", "scope"]);
  for (const issue of r.error.issues) {
    // Preserve legacy wording so `cards --check` output stays stable.
    if (typeof issue.message === "string" && (/needs |max 1/.test(issue.message))) {
      out.push(issue.message);
      continue;
    }
    const top = String(issue.path[0] ?? "");
    if (required.has(top)) {
      const tag = `missing ${top}`;
      if (!out.includes(tag)) out.push(tag);
    } else {
      out.push(`${top || "value"}: ${issue.message}`);
    }
  }
  return out;
}

/** Goal coverage warnings (non-fatal). Tier B without a goal is not a failure
 * in this phase; the warning list is for stats and review. Returns one line per
 * card that lacks a goal, so callers can count safely. */
export function checkGoalCoverage(card: unknown): string[] {
  if (card && typeof card === "object") {
    const c = card as { tier?: string; id?: string; goal?: string };
    if (c.tier === "B" && !(c.goal && String(c.goal).trim())) {
      return [`${String(c.id ?? "?")}: missing goal (Tier B warning)`];
    }
  }
  return [];
}
