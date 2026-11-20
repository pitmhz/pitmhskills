// MCP stdio server on @modelcontextprotocol/sdk: exposes route, get_ref, phase_done. No HTTP, no auth.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { route } from "./route.ts";
import { openCouncil, recordNote } from "./council.ts";
import { composeCouncil } from "./council-compose.ts";
import { detectPhases } from "./plan.ts";
import { getSession, phaseDone } from "./session.ts";
import { runGates } from "./gates.ts";
import { openDb } from "./db.ts";
import { recordUsage } from "./analytics.ts";
import { pruneExpired } from "./council-store.ts";
import { fetchRef } from "./serve-ref.ts";

try {
  const db = openDb();
  try { pruneExpired(db); } finally { db.close(); }
} catch { /* ignore */ }

// Keep the temp memory clean while the server runs.
const pruneTimer = setInterval(() => {
  try {
    const db = openDb();
    try { pruneExpired(db); } finally { try { db.close(); } catch { /* ignore */ } }
  } catch { /* ignore */ }
}, 5 * 60 * 1000);
try { (pruneTimer as { unref?: () => void }).unref?.(); } catch { /* ignore */ }

const server = new McpServer(
  { name: "pitmhskills", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

// Gate contract: ABSTAIN with candidates and ASK are blocking. The caller
// must delegate (council or user pick) when must_delegate is true. Proceed
// bare only when proceed_bare_allowed is true. MCP cannot block the caller
// itself; a harness reads must_delegate / proceed_bare_allowed /
// block_reason from the result and enforces the block.
server.tool(
  "route",
  "Route a task to exactly one skill or ABSTAIN. Gate: ABSTAIN with candidates and ASK are blocking; proceed bare only when proceed_bare_allowed==true. When must_delegate==true, call council or ask the user; block_reason says what to do next.",
  { task: z.string(), cwd: z.string().optional(), session_id: z.string().optional() },
  async ({ task, cwd, session_id }) => {
    const r = route(task, cwd ?? process.cwd(), session_id ?? "mcp");
    return { content: [{ type: "text" as const, text: JSON.stringify(r, null, 2) }] };
  },
);

server.tool(
  "council",
  "Open a skill council for a contested task. Returns a deliberation id and a spawn plan: one brief per candidate skill, each scoped to ONE skill, plus one critic brief, chunked into batches of max 3. Process batches in order, record notes per batch, then next batch. Spawn one subagent per brief, have each write a verdict with the `note` tool, then call `compose`.",
  { task: z.string(), cwd: z.string().optional(), session_id: z.string().optional() },
  async ({ task, cwd, session_id }) => {
    const c = openCouncil(task, cwd ?? process.cwd(), { sessionId: session_id ?? "mcp" });
    return { content: [{ type: "text" as const, text: JSON.stringify(c, null, 2) }] };
  },
);

server.tool(
  "note",
  "Record one verdict in a council's temporary memory. A candidate with no verdict is dropped, so silence is not consent.",
  {
    deliberation_id: z.string(),
    skill_id: z.string(),
    verdict: z.enum(["keep", "drop", "merge"]),
    evidence: z.string().optional(),
    role: z.enum(["specialist", "critic"]).optional(),
  },
  async ({ deliberation_id, skill_id, verdict, evidence, role }) => {
    const r = recordNote(deliberation_id, skill_id, verdict, evidence ?? "", role ?? "specialist");
    return { content: [{ type: "text" as const, text: JSON.stringify(r, null, 2) }] };
  },
);

server.tool(
  "compose",
  "Merge a council's verdicts into ONE decision: one skill, one merged brief, and the bounded list of what was dropped and why.",
  { deliberation_id: z.string(), cwd: z.string().optional() },
  async ({ deliberation_id, cwd }) => {
    const r = composeCouncil(deliberation_id, cwd ?? process.cwd());
    return { content: [{ type: "text" as const, text: JSON.stringify(r, null, 2) }] };
  },
);

server.tool(
  "plan",
  "Detect multi-phase plan for a task",
  { task: z.string(), cwd: z.string().optional() },
  async ({ task, cwd }) => {
    const result = detectPhases(task, cwd ?? process.cwd());
    return { content: [{ type: "text" as const, text: JSON.stringify(result ?? { phases: [], note: "single-phase: use route" }, null, 2) }] };
  },
);

server.tool(
  "get_ref",
  "Fetch an extra reference file from a skill, or one SECTIONS section by name",
  { skill_id: z.string(), path: z.string() },
  async ({ skill_id, path }) => fetchRef(skill_id, path),
);

server.tool(
  "phase_done",
  "Close current phase, run gates. Pass touched_files for a real slop scan; without it the scan is vacuous.",
  { session_id: z.string(), touched_files: z.array(z.string()).optional() },
  async ({ session_id, touched_files }) => {
    const sid = session_id ?? "default";
    const before = getSession(sid); // read BEFORE phaseDone clears the lock
    const skill = before.active_skill;
    let verify: string[] = [];
    let note = "no active skill";
    if (skill) {
      try {
        const db = openDb();
        const row = db.query<{ verify_text: string }, string>(`SELECT verify_text FROM cards WHERE id = ?`).get(skill);
        db.close();
        verify = row?.verify_text ? (JSON.parse(row.verify_text) as string[]) : [];
        note = `skill=${skill} gates=${verify.length}`;
      } catch (e) {
        note = `skill=${skill} db_error=${(e as Error).message.slice(0, 120)}`;
      }
    }
    const gates = runGates(verify, process.cwd());
    let slop = { pass: true, output: "slop: skipped (src/slop.ts absent, owned by another agent)" };
    try {
      const m = (await import("./slop.ts")) as {
        runSlopScan?: (cwd: string, files: string[]) => Promise<{ pass: boolean; hits: unknown[] }>;
      };
      if (typeof m.runSlopScan === "function") {
        const files = touched_files ?? [];
        const r = await m.runSlopScan(process.cwd(), files);
        slop = {
          pass: r.pass,
          output:
            touched_files && touched_files.length > 0
              ? `slop: scanned ${files.length} task-touched files, hits=${r.hits.length}`
              : `slop: scanned 0 task-touched files, hits=${r.hits.length}\nhint: provide touched_files for a real scan`,
        };
      } else slop = { pass: true, output: "slop: skipped (runSlopScan not exported)\nhint: provide touched_files for a real scan" };
    } catch {
      /* slop.ts absent — keep skipped note */
    }
    if ((!touched_files || touched_files.length === 0) && !slop.output.includes("hint: provide touched_files for a real scan")) {
      slop = { pass: slop.pass, output: `${slop.output}\nhint: provide touched_files for a real scan` };
    }
    // Usage row: the agent closed a phase with an active skill, so the skill
    // was used. No active skill means nothing was used: no row.
    if (skill) {
      try {
        recordUsage({ sessionId: sid, skillId: skill, phase: before.phase, gatesPass: gates.pass ? 1 : 0, slopPass: slop.pass ? 1 : 0, source: "phase_done" });
      } catch { /* analytics must never break a phase close */ }
    }
    phaseDone(sid);
    const pass = gates.pass && slop.pass;
    const text = [
      `phase closed pass=${pass} (${note})`,
      `gates pass=${gates.pass}`,
      gates.output.trim(),
      `slop pass=${slop.pass}`,
      slop.output.trim(),
    ]
      .filter((l) => l)
      .join("\n");
    return { content: [{ type: "text" as const, text }] };
  },
);

await server.connect(new StdioServerTransport());
