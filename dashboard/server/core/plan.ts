import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { diffFile, type FileDiff } from "./diff.ts";
import { safePath, repoRel } from "../adapter/repo.ts";

export type PlanMutation =
  | { op: "write"; file: string; content: string }
  | { op: "delete"; file: string };

export type Plan = {
  plan_id: string;
  op: string;
  ids: string[];
  mutations: PlanMutation[];
  diffs: FileDiff[];
  warnings: string[];
  will_run: string[];
  created_at: string;
};

const activePlans = new Map<string, Plan>();

/** Generate a mutation plan with unified diffs and safety warnings without writing to disk. */
export function createPlan(op: string, ids: string[], mutations: PlanMutation[], warnings: string[] = []): Plan {
  const plan_id = randomUUID().replace(/-/g, "").slice(0, 16);
  const diffs: FileDiff[] = [];

  for (const mut of mutations) {
    if (mut.op === "write") {
      diffs.push(diffFile(mut.file, mut.content));
    } else if (mut.op === "delete") {
      const full = safePath(mut.file);
      const oldContent = existsSync(full) ? readFileSync(full, "utf8") : "";
      diffs.push(diffFile(mut.file, ""));
    }
  }

  const will_run = ["bun src/cli.ts index", "bun src/cli.ts cards --check"];
  const plan: Plan = {
    plan_id,
    op,
    ids,
    mutations,
    diffs,
    warnings,
    will_run,
    created_at: new Date().toISOString(),
  };

  activePlans.set(plan_id, plan);
  // Auto-prune plans older than 30 minutes
  setTimeout(() => activePlans.delete(plan_id), 30 * 60 * 1000);
  return plan;
}

export function getPlan(plan_id: string): Plan | undefined {
  return activePlans.get(plan_id);
}

export function consumePlan(plan_id: string): Plan {
  const p = activePlans.get(plan_id);
  if (!p) throw new Error(`Plan not found or expired: ${plan_id}`);
  activePlans.delete(plan_id);
  return p;
}
