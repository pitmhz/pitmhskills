import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { routeWith } from "./route.ts";
import { loadBody, scopeFence } from "./deliver.ts";
import { runGates, executorPrompt, runSlopScan } from "./gates.ts";

// Task-output harness: OBSERVES what happens after the pick. Never tunes.
// Our side makes no model calls: it prepares inputs and scores committed diffs.
export interface TaskSpec {
  id: string;
  task: string;
  repo: string; // path to the pinned scratch snapshot
  expect_skill: string;
  note?: string;
}

export interface DiffScore {
  diffLines: number;
  changedFiles: string[];
  testsPass: boolean;
  gatesOutput: string;
  slopHits: number;
  slopPass: boolean;
}

// Emit the harness-built prompt for a task in a scratch repo (what the executor sees).
export function prepareTask(t: TaskSpec): string {
  const r = routeWith(t.task, t.repo, { sessionId: `taskeval:${t.id}`, lock: false, log: false });
  if (r.outcome === "ABSTAIN" || !r.skill_id) {
    return executorPrompt(t.task, "1 of 1", "No skill applies. Work without a skill body.", "Only touch files the task names.", []);
  }
  const verify = r.verify ?? [];
  return executorPrompt(t.task, "1 of 1", r.body, r.scope_fence, verify);
}

function sh(cmd: string, cwd: string): string {
  try {
    return execSync(cmd, { cwd, encoding: "utf8", timeout: 20000, stdio: ["ignore", "pipe", "pipe"] }) as string;
  } catch {
    return "";
  }
}

// Score the committed diff (HEAD vs the snapshot tag `baseline`) in a scratch repo.
export async function scoreDiff(repo: string): Promise<DiffScore> {
  const changedFiles = sh("git diff --name-only baseline", repo).split("\n").map((s) => s.trim()).filter(Boolean);
  const num = sh("git diff --numstat baseline", repo);
  const diffLines = num.split("\n").filter(Boolean).reduce((a, ln) => {
    const [add = "0", del = "0"] = ln.trim().split(/\s+/);
    return a + Number(add || 0) + Number(del || 0);
  }, 0);
  const gates = runGates(["bun run test"], repo, 60000);
  const slop = await runSlopScan(repo);
  return { diffLines, changedFiles, testsPass: gates.pass, gatesOutput: gates.output, slopHits: slop.hits.length, slopPass: slop.pass };
}

export function loadTasks(dir: string): TaskSpec[] {
  const p = join(dir, "tasks.yaml");
  if (!existsSync(p)) return [];
  const raw = readFileSync(p, "utf8");
  const out: TaskSpec[] = [];
  let cur: Record<string, string> = {};
  for (const ln of raw.split("\n")) {
    const item = ln.match(/^\s*-\s+id:\s*(\S+)/);
    if (item) { if (cur["id"]) out.push(toSpec(cur)); cur = { id: item[1]! }; continue; }
    const kv = ln.match(/^\s+(\w+):\s*(.+)$/);
    if (kv && cur["id"]) cur[kv[1]!] = kv[2]!.trim();
  }
  if (cur["id"]) out.push(toSpec(cur));
  return out;
}

function toSpec(c: Record<string, string>): TaskSpec {
  const clean = (s: string) => s.replace(/^["']|["']$/g, "").trim();
  return { id: c["id"]!, task: clean(c["task"]!), repo: clean(c["repo"]!), expect_skill: clean(c["expect_skill"] ?? "NONE"), note: c["note"] };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const dir = args[0] ?? "evals/tasks";
  const mode = args[1] ?? "prepare";
  const tasks = loadTasks(args[0] ?? "evals/tasks");
  if (mode === "prepare") {
    for (const t of tasks) {
      console.log(`\n===== ${t.id} =====`);
      console.log(prepareTask(t));
    }
  }
  if (mode === "provision") {
    const { mkdirSync, writeFileSync, rmSync } = await import("node:fs");
    const { execSync } = await import("node:child_process");
    const base = join(process.cwd(), "evals/tasks/repos");
    rmSync(base, { recursive: true, force: true });
    for (const t of tasks) {
      const d = join(base, t.id);
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, "package.json"), JSON.stringify({
        name: `taskeval-${t.id}`, version: "1.0.0",
        scripts: { test: "bun -e \"process.exit(0)\"" }
      }, null, 2) + "\n");
      writeFileSync(join(d, "CHANGELOG.md"), "# Changelog\n\n## 1.0.0\n- Intial relase\n");
      writeFileSync(join(d, "src.ts"), "export function helper(a: number): number { return a + 1; }\nexport function unused(): void {}\n");
      execSync("git init -q && git add . && git -c user.email=t@t -c user.name=t commit -qm init && git tag baseline", { cwd: d });
      console.log("provisioned:", t.id);
    }
  }
  if (mode === "score") {
    for (const t of tasks) {
      const s = await scoreDiff(t.repo);
      console.log(`${t.id}: diff=${s.diffLines}L files=${s.changedFiles.length} tests=${s.testsPass} slop=${s.slopHits}`);
    }
  }
  void dir;
}
