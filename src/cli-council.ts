import { openCouncil, recordNote } from "./council.ts";
import { composeCouncil } from "./council-compose.ts";

// CLI surface of the council: open, record a verdict, compose.
// Kept out of src/cli.ts so that file stays a dispatcher.

export function runCouncilCommand(cmd: string, args: string[], cwd: string, flag: (name: string) => string | undefined, positionalTask: () => string): number {
  if (cmd === "council") {
    const task = flag("--task") ?? positionalTask();
    if (!task) {
      console.error('usage: bun src/cli.ts council "<task>" [--cwd path] [--session id]');
      return 2;
    }
    const c = openCouncil(task, flag("--cwd") ?? cwd, { sessionId: flag("--session") ?? "default" });
    console.log(`COUNCIL: ${c.id}`);
    console.log(`TASK: ${c.task}`);
    console.log(`CANDIDATES (${c.candidates.length}):`);
    for (const cand of c.candidates) {
      console.log(`  ${cand.id}  score=${cand.score}`);
      console.log(`      ${cand.purpose.slice(0, 110)}`);
      if (cand.disambiguator) console.log(`      when: ${cand.disambiguator.slice(0, 110)}`);
    }
    console.log(`\nSPAWN PLAN (${c.plan.length} briefs, one subagent each):`);
    for (const p of c.plan) console.log(`  [${p.role}] ${p.skill_id}`);
    console.log(`\nBATCHES (${c.plan_batches.length} batches of max 3):`);
    for (const [i, batch] of c.plan_batches.entries()) {
      console.log(`  batch ${i + 1}: ${batch.map((p) => `[${p.role}] ${p.skill_id}`).join(", ")}`);
    }
    console.log(`\nProcess batches in order, record notes per batch, then next batch.`);
    console.log(`Each subagent writes its verdict to the temp memory:`);
    console.log(`  bun src/cli.ts note ${c.id} <skill_id> keep|drop|merge "<one line of evidence>"`);
    console.log(`Then: bun src/cli.ts compose ${c.id}`);
    return 0;
  }

  if (cmd === "note") {
    const id = args[1] ?? "";
    const skillId = args[2] ?? "";
    const verdict = (args[3] ?? "drop") as "keep" | "drop" | "merge";
    const evidence = args.slice(4).join(" ");
    if (!id || !skillId) {
      console.error('usage: bun src/cli.ts note <id> <skill_id> keep|drop|merge "<evidence>"');
      return 2;
    }
    const r = recordNote(id, skillId, verdict, evidence);
    console.log(`${r.message} (${r.notes} notes recorded)`);
    return r.ok ? 0 : 1;
  }

  if (cmd === "compose") {
    const id = args[1] ?? flag("--id") ?? "";
    if (!id) {
      console.error("usage: bun src/cli.ts compose <id> [--cwd path]");
      return 2;
    }
    const r = composeCouncil(id, flag("--cwd") ?? cwd);
    console.log(`DECISION: ${r.skill_id ?? "NONE"}  confidence=${r.confidence}`);
    console.log(`MESSAGE: ${r.message}`);
    if (r.dissent.length) {
      console.log("DISSENT:");
      for (const d of r.dissent) console.log(`  ${d}`);
    }
    if (r.brief) {
      console.log("--- brief ---");
      console.log(r.brief.slice(0, 6000));
    }
    return r.ok ? 0 : 1;
  }

  return -1; // not a council command
}
