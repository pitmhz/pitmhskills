import { execSync } from "node:child_process";
import { runSlopScan as scanSlop } from "./slop.ts";
import type { SlopHit } from "./slop.ts";

// Mechanical quality gates. Run by harness, never self-reported by model.
export function runGates(commands: string[], cwd: string, timeoutMs = 120000): { pass: boolean; output: string } {
  if (commands.length === 0) return { pass: true, output: "no gates configured" };
  let out = "";
  for (const cmd of commands.slice(0, 5)) {
    try {
      const r = execSync(cmd, { cwd, encoding: "utf8", timeout: timeoutMs, stdio: ["ignore", "pipe", "pipe"] });
      out += `$ ${cmd}\n${String(r).slice(0, 3000)}\n`;
    } catch (e) {
      const err = e as { stdout?: string; stderr?: string; message?: string };
      const std = [err.stdout, err.stderr].map((s) => String(s ?? "")).filter(Boolean).join("\n");
      out += `$ ${cmd} FAILED\n${(std || String(err.message ?? e)).slice(0, 3000)}\n`;
      return { pass: false, output: out };
    }
  }
  return { pass: true, output: out };
}

export function executorPrompt(task: string, phase: string, skillBody: string, scope: string, verify: string[]): string {
  return [
    `TASK: ${task}`,
    `PHASE: ${phase}`,
    `SKILL: ${skillBody.slice(0, 12000)}`,
    `SCOPE FENCE: ${scope}`,
    `DO NOT: choose other skills, add features not in TASK, modify auth routes, refactor unrelated code`,
    `DONE WHEN: ${verify.length ? verify.join(" && ") : "task complete"} pass`,
  ].join("\n");
}

// Slop gate: scan task-touched files from `git diff --name-only`. Fail -> revise.
export async function runSlopScan(cwd: string): Promise<{ pass: boolean; output: string; hits: SlopHit[] }> {
  let files: string[] = [];
  try {
    const r = execSync("git diff --name-only", { cwd, encoding: "utf8", timeout: 15000, stdio: ["ignore", "pipe", "pipe"] });
    files = String(r).split("\n").map((s) => s.trim()).filter(Boolean);
  } catch {
    return { pass: true, output: "slop: no diff available", hits: [] };
  }
  if (files.length === 0) return { pass: true, output: "slop: no touched files", hits: [] };
  const r = await scanSlop(cwd, files);
  const out = r.hits.slice(0, 10).map((h) => `${h.file}:${h.line} [${h.category}] ${h.pattern}`).join("\n");
  return { pass: r.pass, output: out || "slop: clean", hits: r.hits };
}
