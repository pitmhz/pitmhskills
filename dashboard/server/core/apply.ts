import { existsSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, safePath } from "../adapter/repo.ts";
import { CMD, runCmd } from "../adapter/exec.ts";
import { backupFiles, restoreBackup } from "./trash.ts";
import { consumePlan } from "./plan.ts";
import { logChange } from "./changes.ts";
import { validation } from "../adapter/skills.ts";

export type ApplyResult = {
  ok: boolean;
  plan_id: string;
  backup: string;
  files_changed: string[];
  reverted: boolean;
  post_steps: { step: string; code: number; stdout: string; stderr: string }[];
  error?: string;
};

/** Executes write protocol: backup -> atomic write -> post-steps (rebuild, validate) -> auto-revert if validation fails. */
export async function applyPlan(plan_id: string): Promise<ApplyResult> {
  const plan = consumePlan(plan_id);
  const affectedFiles = plan.mutations.map((m) => m.file);

  // 1. Snapshot baseline validator bad set
  const preV = await validation();
  const preBadKeys = new Set(preV.bad.keys());

  // 2. Backup affected files
  const backupId = backupFiles(affectedFiles);

  // 3. Atomic writes
  const appliedFiles: string[] = [];
  try {
    for (const mut of plan.mutations) {
      const full = safePath(mut.file);
      if (mut.op === "write") {
        const tmp = `${full}.tmp.${Date.now()}`;
        writeFileSync(tmp, mut.content, "utf8");
        renameSync(tmp, full);
        appliedFiles.push(mut.file);
      } else if (mut.op === "delete") {
        if (existsSync(full)) {
          unlinkSync(full);
          appliedFiles.push(mut.file);
        }
      }
    }
  } catch (err) {
    restoreBackup(backupId);
    throw new Error(`Write failed: ${(err as Error).message}. Restored from backup.`);
  }

  // 4. Post-steps: Rebuild index, then Validate cards
  const postSteps: ApplyResult["post_steps"] = [];
  const rebuildRes = await runCmd(CMD.rebuild(), ROOT);
  postSteps.push({ step: "rebuild", code: rebuildRes.code, stdout: rebuildRes.stdout, stderr: rebuildRes.stderr });

  const validateRes = await runCmd(CMD.validate(), ROOT);
  postSteps.push({ step: "validate", code: validateRes.code, stdout: validateRes.stdout, stderr: validateRes.stderr });

  // 5. Verification check
  let newBad = false;
  const postBad: string[] = [];
  for (const line of validateRes.stdout.split(/\r?\n/)) {
    const b = /^(.+?)\.json: (.*)$/.exec(line);
    if (b) {
      postBad.push(b[1]);
      if (!preBadKeys.has(b[1])) newBad = true;
    }
  }

  // If new validation errors appeared or rebuild crashed, automatically revert
  if (rebuildRes.code !== 0 || newBad) {
    restoreBackup(backupId);
    // Re-run rebuild after restore
    await runCmd(CMD.rebuild(), ROOT);
    const errReason = rebuildRes.code !== 0 ? `Rebuild error (code ${rebuildRes.code})` : `New card validation failures: ${postBad.join(", ")}`;
    logChange({
      op: `${plan.op}.reverted`,
      ids: plan.ids,
      files: appliedFiles,
      trash: backupId,
      note: `Reverted due to: ${errReason}`,
    });
    return {
      ok: false,
      plan_id: plan.plan_id,
      backup: backupId,
      files_changed: appliedFiles,
      reverted: true,
      post_steps: postSteps,
      error: errReason,
    };
  }

  // 6. Log success
  logChange({
    op: plan.op,
    ids: plan.ids,
    files: appliedFiles,
    trash: backupId,
    diff: plan.diffs.map((d) => d.patch).join("\n"),
  });

  return {
    ok: true,
    plan_id: plan.plan_id,
    backup: backupId,
    files_changed: appliedFiles,
    reverted: false,
    post_steps: postSteps,
  };
}
