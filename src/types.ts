// Card schema - single source of truth, one file per skill in cards/
export interface CardSection {
  name: string;
  bytes: number;
  when: string;
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
  body_tokens?: number;
  core_bytes?: number;
  sections?: CardSection[];
  verify?: string[];
  skill_path?: string; // local path to raw SKILL.md
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
  ask_question?: string;
  candidates?: { id: string; score: number; reason: string }[];
}

export function validateCard(c: unknown): string[] {
  const errs: string[] = [];
  const o = c as Record<string, unknown>;
  for (const f of ["id", "tier", "purpose", "domain", "task_types", "use_when", "do_not_use_when", "scope"]) {
    if (o[f] === undefined || o[f] === null || (Array.isArray(o[f]) && o[f].length === 0) || o[f] === "") {
      errs.push(`missing ${f}`);
    }
  }
  if (o["tier"] === "A" && (!o["use_when"] || !o["do_not_use_when"])) errs.push("tier A needs use_when+do_not_use_when");
  if (o["cluster_role"] === "variant" && !o["pick_over_primary_when"]) errs.push("variant needs pick_over_primary_when");
  if (Array.isArray(o["pairs_with"]) && (o["pairs_with"] as unknown[]).length > 1) errs.push("pairs_with max 1");
  return errs;
}
