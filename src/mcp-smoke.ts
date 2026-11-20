// Smoke test the MCP stdio server: list tools, call route, council, note, compose.
import { spawn } from "node:child_process";

const proc = spawn("bun", ["src/serve.ts"], { cwd: process.cwd(), stdio: ["pipe", "pipe", "pipe"] });
let buf = "";
const pending = new Map<number, (v: unknown) => void>();
let nextId = 1;

proc.stdout.on("data", (d: Buffer) => {
  buf += d.toString();
  let i: number;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    try {
      const msg = JSON.parse(line) as { id?: number; result?: unknown };
      if (msg.id !== undefined && pending.has(msg.id)) {
        pending.get(msg.id)!(msg.result);
        pending.delete(msg.id);
      }
    } catch { /* not json */ }
  }
});
proc.stderr.on("data", (d: Buffer) => process.stderr.write(`[server] ${d.toString()}`));

function send(method: string, params: unknown): Promise<unknown> {
  const id = nextId++;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    proc.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  });
}

function notify(method: string, params: unknown): void {
  proc.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
}

function textOf(res: unknown): string {
  const r = res as { content?: { type: string; text: string }[] };
  return (r?.content ?? []).map((c) => c.text).join("\n");
}

await send("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "smoke", version: "1" } });
notify("notifications/initialized", {});

const tools = (await send("tools/list", {})) as { tools: { name: string; description: string }[] };
console.log("TOOLS:", tools.tools.map((t) => t.name).join(", "));

const task = "Design a dense admin dashboard with panels, settings and data tables for a monitoring product";
const routed = await send("tools/call", { name: "route", arguments: { task, cwd: process.cwd() } });
const routedText = textOf(routed);
console.log("\nROUTE:", routedText.split("\n").filter((l) => /OUTCOME|SKILL|CONFIDENCE/.test(l)).join(" | "));

const council = await send("tools/call", { name: "council", arguments: { task, cwd: process.cwd() } });
const c = JSON.parse(textOf(council)) as { id: string; candidates: { id: string }[]; plan: { skill_id: string; role: string }[] };
console.log(`\nCOUNCIL ${c.id}: candidates=${c.candidates.map((x) => x.id).join(", ")}`);
console.log(`PLAN: ${c.plan.map((p) => `${p.role}:${p.skill_id}`).join(", ")}`);

for (const cand of c.candidates) {
  const verdict = cand.id === "interface-design__interface-design" ? "keep" : "drop";
  const evidence = verdict === "keep" ? "dashboards, admin panels, settings pages and data tables" : "not a dashboard skill";
  const n = await send("tools/call", { name: "note", arguments: { deliberation_id: c.id, skill_id: cand.id, verdict, evidence } });
  console.log(`NOTE ${cand.id}: ${textOf(n).replace(/\s+/g, " ").slice(0, 80)}`);
}

const composed = await send("tools/call", { name: "compose", arguments: { deliberation_id: c.id, cwd: process.cwd() } });
const comp = JSON.parse(textOf(composed)) as { skill_id: string; message: string; dissent: string[]; brief: string };
console.log(`\nCOMPOSED: ${comp.skill_id} :: ${comp.message}`);
console.log(`DISSENT: ${comp.dissent.join(" | ")}`);
console.log(`BRIEF HEAD: ${comp.brief.split("\n").slice(0, 3).join(" / ").slice(0, 160)}`);

proc.kill();
