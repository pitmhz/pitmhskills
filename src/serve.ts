// MCP stdio server on @modelcontextprotocol/sdk: exposes route, get_ref, phase_done. No HTTP, no auth.
import { readFileSync, existsSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { route } from "./route.ts";
import { getSession, phaseDone } from "./session.ts";
import { runGates } from "./gates.ts";
import { openDb } from "./db.ts";

const server = new McpServer(
  { name: "pitmhskills", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.tool(
  "route",
  "Route a task to exactly one skill or ABSTAIN",
  { task: z.string(), cwd: z.string().optional() },
  async ({ task, cwd }) => {
    const r = route(task, cwd ?? process.cwd(), "mcp");
    return { content: [{ type: "text" as const, text: JSON.stringify(r, null, 2) }] };
  },
);

server.tool(
  "get_ref",
  "Fetch an extra reference file from a skill",
  { skill_id: z.string(), path: z.string() },
  async ({ skill_id, path }) => {
    const base = skill_id.replace(/[^a-zA-Z0-9_-]/g, "");
    const rel = path.replace(/\.\./g, "");
    const cardPath = `cards/${base}.json`;
    if (!existsSync(cardPath)) throw new Error("unknown skill");
    const card = JSON.parse(readFileSync(cardPath, "utf8")) as { skill_path?: string };
    const dir = card.skill_path?.split(/[/\\]/).slice(0, -1).join("/") ?? "";
    const full = dir ? `${dir}/${rel}` : rel;
    if (!existsSync(full)) throw new Error("ref not found");
    return { content: [{ type: "text" as const, text: readFileSync(full, "utf8").slice(0, 20000) }] };
  },
);

server.tool(
  "phase_done",
  "Close current phase, run gates",
  { session_id: z.string() },
  async ({ session_id }) => {
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
        // phase_done carries no touched-file list, so scan [] (vacuous pass);
        // slop owner wires task-touched diffs when available.
        const r = await m.runSlopScan(process.cwd(), []);
        slop = { pass: r.pass, output: `slop: scanned 0 task-touched files, hits=${r.hits.length}` };
      } else slop = { pass: true, output: "slop: skipped (runSlopScan not exported)" };
    } catch {
      /* slop.ts absent — keep skipped note */
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
