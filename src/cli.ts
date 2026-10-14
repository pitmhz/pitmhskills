import { buildIndex, checkCards, largestSourceFile } from "./index.ts";
import { buildCards } from "./card.ts";
import { ingest } from "./ingest.ts";
import { route, formatResult } from "./route.ts";
import { detectPhases } from "./plan.ts";
import { executorPrompt } from "./gates.ts";
import { openDb, initDb } from "./db.ts";
import { loadAllCards } from "./retrieve.ts";
import { loadBody, scopeFence } from "./deliver.ts";
import { runEval } from "./eval.ts";
import { calibrate } from "./calibrate.ts";
import { runInit } from "./init.ts";
import { runAdd } from "./add.ts";
import { profilePath } from "./profile.ts";

const args = process.argv.slice(2);
const cmd = args[0] ?? "help";
const cwd = process.cwd();

function flag(name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}
const has = (n: string) => args.includes(n);

if (cmd === "ingest") {
  const r = ingest({ bump: flag("--bump"), provider: flag("--provider") });
  console.log(`ingested sources=${r.fetched} skipped=${r.skipped.length}`);
  for (const s of r.skipped) console.log(`skip: ${s}`);
} else if (cmd === "cards") {
  if (has("--check")) {
    const c = checkCards();
    console.log(`ok=${c.ok} bad=${c.bad.length}`);
    for (const b of c.bad) console.log(`${b.file}: ${b.errs.join("; ")}`);
    if (c.bad.length) process.exit(1);
  } else {
    const r = buildCards({ provider: flag("--provider") });
    console.log(`cards made=${r.made} cached=${r.cached} errors=${r.errors.length}`);
    for (const e of r.errors) console.log(`err: ${e}`);
  }
} else if (cmd === "index") {
  const r = buildIndex();
  console.log(`indexed cards=${r.cards} errors=${r.errors.length}`);
  for (const e of r.errors) console.log(`err: ${e}`);
} else if (cmd === "route") {
  const task = flag("--task") ?? args.slice(1).join(" ").replace(/^--\S+(\s+\S+)?/g, "").trim();
  if (!task) { console.error('usage: bun src/cli.ts route "task" [--cwd path] [--session id]'); process.exit(2); }
  const r = route(task, flag("--cwd") ?? cwd, flag("--session") ?? "default");
  console.log(formatResult(r));
} else if (cmd === "run") {
  const cwdFlag = flag("--cwd") ?? cwd;
  const sessionFlag = flag("--session") ?? "default";
  const explicit = flag("--task");
  let task = "";
  if (explicit) task = explicit;
  else {
    const skip = new Set(["--cwd", "--session", "--task"]);
    const parts: string[] = [];
    for (let i = 1; i < args.length; i++) {
      const a = args[i]!;
      if (skip.has(a)) { i++; continue; }
      if (a.startsWith("--")) continue;
      parts.push(a);
    }
    task = parts.join(" ").trim();
  }
  if (!task) { console.error('usage: bun src/cli.ts run "<task>" [--cwd path] [--session id]'); process.exit(2); }
  const plan = detectPhases(task, cwdFlag);
  if (!plan) {
    const r = route(task, cwdFlag, sessionFlag);
    if (r.outcome === "ABSTAIN" || !r.skill_id) {
      console.log(`Phase 1 of 1: bare -> proceed bare (no skill above floor)`);
      console.log(executorPrompt(task, "1 of 1", "No skill applies. Work without a skill body.", "Only touch files the task names.", []));
      console.log(`DONE WHEN: task complete`);
    } else {
      console.log(`Phase 1 of 1: ${r.skill_id} -> ${r.why}`);
      console.log(executorPrompt(task, "1 of 1", r.body, r.scope_fence, r.verify));
      console.log(`DONE WHEN: ${(r.verify ?? []).length ? (r.verify ?? []).join(" && ") : "task complete"}`);
    }
  } else {
    const n = plan.phases.length;
    for (const p of plan.phases) console.log(`Phase ${p.n}: ${p.skill_id} -> ${p.why}`);
    const db = openDb();
    const byId = new Map<string, ReturnType<typeof loadAllCards>[number]>();
    try { initDb(db); for (const c of loadAllCards(db)) byId.set(c.id, c); } finally { db.close(); }
    for (const p of plan.phases) {
      const card = byId.get(p.skill_id);
      if (!card) { console.log(`Phase ${p.n} of ${n}: ${p.skill_id} -> proceed bare (card missing, never phantom)`); continue; }
      const { body } = loadBody(card, 3000);
      const scope = scopeFence(card);
      const verify = card.verify ?? [];
      console.log(executorPrompt(task, `${p.n} of ${n}`, body, scope, verify));
      console.log(`DONE WHEN: ${verify.length ? verify.join(" && ") : "task complete"}`);
    }
  }
} else if (cmd === "eval") {
  const r = runEval(cwd);
  console.log(`top1=${(r.top1 * 100).toFixed(1)}% wrong=${(r.wrong * 100).toFixed(1)}% none_prec=${(r.nonePrec * 100).toFixed(1)}% n=${r.total}`);
  for (const f of r.fails.slice(0, 20)) console.log(`FAIL: ${f}`);
  const big = largestSourceFile().filter((x) => x.lines > 200);
  for (const b of big) console.log(`SIZE: ${b.file} ${b.lines} lines > 200`);
  if (r.total > 0 && r.top1 < 0.8) process.exit(1);
} else if (cmd === "calibrate") {
  const b = calibrate(cwd);
  console.log(`floor=${b.floor} margin=${b.margin} top1=${(b.top1 * 100).toFixed(1)}%`);
} else if (cmd === "init") {
  runInit(cwd, has("--refresh") ? { refresh: true } : {});
  console.log(`profile ${profilePath(cwd)}`);
} else if (cmd === "add") {
  const skill = flag("--skill");
  let spec: string | undefined;
  for (let i = 1; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--skill") { i++; continue; }
    if (a.startsWith("--")) continue;
    spec = a; break;
  }
  if (!spec || spec === "help" || has("--help")) { console.error("usage: bun src/cli.ts add <owner/repo[@skill]|local-path> [--skill name]"); process.exit(2); }
  try {
    const r = runAdd(spec, cwd, skill ? { skill } : {});
    console.log(`id=${r.id}`);
    console.log(`skills=${r.skills.length} ${r.skills.join(", ")}`);
    console.log(`sha=${r.sha}`);
    for (const p of r.probes) console.log(`probe ${JSON.stringify(p.task)} -> ${p.outcome} ${p.skill_id ?? "NONE"}`);
    console.log("golden (not appended):");
    for (const g of r.golden) console.log(g);
  } catch (e) { console.error((e as Error).message); process.exit(1); }
} else {
  console.log("pitmhskills ingest|cards [--check]|index|route \"<task>\"|run \"<task>\"|eval|calibrate|init [--refresh]|add <spec>");
}
