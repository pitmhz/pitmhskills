// MCP stdio server: exposes route, get_ref, phase_done. No HTTP, no auth.
import { readFileSync, existsSync } from "node:fs";
import { route } from "./route.ts";
import { getSession, phaseDone } from "./session.ts";
import { runGates } from "./gates.ts";
import { openDb } from "./db.ts";

async function readStdin(): Promise<string[]> {
  const lines: string[] = [];
  for await (const chunk of Bun.stdin.stream()) {
    const text = new TextDecoder().decode(chunk);
    for (const ln of text.split("\n")) if (ln.trim()) lines.push(ln);
    // process incrementally: handle each complete JSON-RPC line
    while (lines.length) await handle(lines.shift()!);
  }
  return [];
}

async function handle(line: string): Promise<void> {
  let msg: { id?: number | string; method?: string; params?: Record<string, unknown> };
  try { msg = JSON.parse(line); } catch { return; }
  const id = msg.id ?? null;
  const send = (result: unknown) => Bun.write(Bun.stdout, JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
  const fail = (message: string) => Bun.write(Bun.stdout, JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32000, message } }) + "\n");
  try {
    if (msg.method === "initialize") return void send({ protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "pitmhskills", version: "0.1.0" } });
    if (msg.method === "tools/list") return void send({ tools: [
      { name: "route", description: "Route a task to exactly one skill or ABSTAIN", inputSchema: { type: "object", properties: { task: { type: "string" }, cwd: { type: "string" } }, required: ["task"] } },
      { name: "get_ref", description: "Fetch an extra reference file from a skill", inputSchema: { type: "object", properties: { skill_id: { type: "string" }, path: { type: "string" } }, required: ["skill_id", "path"] } },
      { name: "phase_done", description: "Close current phase, run gates", inputSchema: { type: "object", properties: { session_id: { type: "string" } }, required: ["session_id"] } },
    ] });
    if (msg.method === "tools/call") {
      const p = (msg.params ?? {}) as { name?: string; arguments?: Record<string, unknown> };
      if (p.name === "route") {
        const task = String(p.arguments?.["task"] ?? "");
        const cwd = String(p.arguments?.["cwd"] ?? process.cwd());
        const r = route(task, cwd, "mcp");
        return void send({ content: [{ type: "text", text: JSON.stringify(r, null, 2) }] });
      }
      if (p.name === "get_ref") {
        const base = String(p.arguments?.["skill_id"] ?? "").replace(/[^a-zA-Z0-9_-]/g, "");
        const rel = String(p.arguments?.["path"] ?? "").replace(/\.\./g, "");
        const cardPath = `cards/${base}.json`;
        if (!existsSync(cardPath)) return void fail("unknown skill");
        const card = JSON.parse(readFileSync(cardPath, "utf8")) as { skill_path?: string };
        const dir = card.skill_path?.split(/[/\\]/).slice(0, -1).join("/") ?? "";
        const full = dir ? `${dir}/${rel}` : rel;
        if (!existsSync(full)) return void fail("ref not found");
        return void send({ content: [{ type: "text", text: readFileSync(full, "utf8").slice(0, 20000) }] });
      }
      if (p.name === "phase_done") {
        const sid = String(p.arguments?.["session_id"] ?? "default");
        const before = getSession(sid); // read BEFORE phaseDone clears the lock
        const skill = before.active_skill;
        let verify: string[] = [];
        let note = "no active skill";
        if (skill) {
          try {
            const db = openDb();
            const row = db.query<{ verify_text: string }, string>(`SELECT verify_text FROM cards WHERE id = ?`).get(skill);
            db.close();
            verify = row?.verify_text ? JSON.parse(row.verify_text) as string[] : [];
            note = `skill=${skill} gates=${verify.length}`;
          } catch (e) {
            note = `skill=${skill} db_error=${(e as Error).message.slice(0, 120)}`;
          }
        }
        const gates = runGates(verify, process.cwd());
        let slop = { pass: true, output: "slop: skipped (src/slop.ts absent, owned by another agent)" };
        try {
          const m = await import("./slop.ts") as { runSlopScan?: (cwd: string, files: string[]) => Promise<{ pass: boolean; hits: unknown[] }> };
          if (typeof m.runSlopScan === "function") {
            // phase_done carries no touched-file list, so scan [] (vacuous pass);
            // slop owner wires task-touched diffs when available.
            const r = await m.runSlopScan(process.cwd(), []);
            slop = { pass: r.pass, output: `slop: scanned 0 task-touched files, hits=${r.hits.length}` };
          } else slop = { pass: true, output: "slop: skipped (runSlopScan not exported)" };
        } catch { /* slop.ts absent — keep skipped note */ }
        phaseDone(sid);
        const pass = gates.pass && slop.pass;
        const text = [`phase closed pass=${pass} (${note})`, `gates pass=${gates.pass}`, gates.output.trim(), `slop pass=${slop.pass}`, slop.output.trim()].filter((l) => l).join("\n");
        return void send({ content: [{ type: "text", text }] });
      }
      return void fail(`unknown tool ${p.name}`);
    }
    if (msg.method === "notifications/initialized" || !msg.method) return;
    return void fail(`unknown method ${msg.method}`);
  } catch (e) {
    return void fail((e as Error).message);
  }
}

await readStdin();
