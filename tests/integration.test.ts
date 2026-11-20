// Integration test: the whole blend, end to end, with the real functions.
// No mocks. Every module in the chain is the shipped one.
// Run: bun test tests/integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { existsSync, rmSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(ROOT); // the router resolves card files relative to cwd
const { routeWith } = await import("../src/route.ts");
const { openCouncil, recordNote } = await import("../src/council.ts");
const { composeCouncil } = await import("../src/council-compose.ts");
const { loadBody, DELIVER_CAP } = await import("../src/deliver.ts");
const { fetchRef } = await import("../src/serve-ref.ts");
const { runGates } = await import("../src/gates.ts");
const { lockSkill, getSession } = await import("../src/session.ts");
const { openDb, initDb } = await import("../src/db.ts");
const { loadAllCards } = await import("../src/retrieve.ts");
const SID = `integration-${process.pid}-${Date.now()}`; // unique per run
const TASK = "Design a dense admin dashboard with panels, settings and data tables for a monitoring product";
const CARD = "anthropic__frontend-design";
const SECTION = "Design principles";
const delibIds: string[] = [];
let cards: ReturnType<typeof loadAllCards> = [];
beforeAll(() => {
  const db = openDb();
  initDb(db);
  cards = loadAllCards(db);
  db.close();
});
afterAll(async () => {
  const sess = join(ROOT, ".state", `${SID}.json`);
  if (existsSync(sess)) rmSync(sess, { force: true });
  for (const id of delibIds) {
    const dir = join(ROOT, ".state", "council", id);
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  }
  // BUG NOTE: route.ts always calls recordOffer() (src/route.ts:85,122,150) even
  // when log:false, so skill_offers gets a row per route call. The offers table
  // cannot be kept clean with log:false alone. Delete by session id. The retry
  // works around a WAL race with a still-closing child process.
  for (let attempt = 0; attempt < 5; attempt++) {
    let db: ReturnType<typeof openDb> | null = null;
    try {
      db = openDb();
      initDb(db);
      for (const id of delibIds) {
        db.query("DELETE FROM deliberation_notes WHERE deliberation_id = ?").run(id);
        db.query("DELETE FROM deliberations WHERE id = ?").run(id);
      }
      db.query("DELETE FROM skill_offers WHERE session_id = ?").run(SID);
      db.query("DELETE FROM skill_usage WHERE session_id = ?").run(SID);
      db.close();
      break;
    } catch {
      try { db?.close(); } catch { /* ignore */ }
      await new Promise((r) => setTimeout(r, 300));
    }
  }
});
// Call one MCP tool over real stdio and return its text.
async function mcpTool(name: string, args: Record<string, unknown>): Promise<string> {
  const client = new Client({ name: "integration", version: "1" }, { capabilities: {} });
  await client.connect(new StdioClientTransport({ command: "bun", args: ["src/serve.ts"], cwd: ROOT }));
  try {
    const res = (await client.callTool({ name, arguments: args })) as { content?: { text: string }[] };
    return (res.content ?? []).map((c) => c.text).join("\n");
  } finally {
    await client.close();
  }
}
describe("pitmhskills integration blend", () => {
  it("1. route: task -> filter -> retrieve -> collapse -> score -> decide -> deliver", () => {
    const r = routeWith(TASK, ROOT, { sessionId: SID, lock: false, log: false });
    expect(["PICK", "ASK"]).toContain(r.outcome);
    expect(r.skill_id).toBeTruthy();
    expect(r.confidence).toBeGreaterThan(0);
    expect(r.body.length).toBeGreaterThan(0);
    // The gate contract the harness reads (src/serve.ts:35-39).
    if (r.outcome === "ASK") {
      expect(r.must_delegate).toBe(true);
      expect(r.proceed_bare_allowed).toBe(false);
      expect(r.block_reason).toContain("do not proceed bare");
      expect(r.ask_question).toBeTruthy();
    } else {
      expect(r.must_delegate).toBe(false);
    }
    // lock:false means no session lock was taken.
    // BUG NOTE: src/route.ts:128 initialises locked=true and only assigns it
    // inside `if (doLock)`, so a lock:false call still reports locked=true.
    expect(getSession(SID).active_skill).toBe(null);
  });
  it("2. council: contested task -> spawn plan in batches of max 3", () => {
    const c = openCouncil(TASK, ROOT, { sessionId: SID });
    delibIds.push(c.id);
    expect(c.candidates.length).toBeGreaterThanOrEqual(2);
    expect(c.plan.length).toBe(c.candidates.length + 1); // one critic + one per candidate
    expect(c.plan.filter((p) => p.role === "critic").length).toBe(1);
    expect(c.plan_batches.length).toBeGreaterThan(0);
    for (const b of c.plan_batches) expect(b.length).toBeLessThanOrEqual(3);
    expect(c.plan_batches.flat().map((p) => p.skill_id)).toEqual(c.plan.map((p) => p.skill_id));
    const spec = c.plan.find((p) => p.role === "specialist")!;
    expect(spec.prompt).toContain("YOUR SKILL:");
    expect(spec.prompt).toContain("note(");
  });
  it("3. note: record one verdict in the council memory", () => {
    const c = openCouncil(TASK, ROOT, { sessionId: SID });
    delibIds.push(c.id);
    const n = recordNote(c.id, c.candidates[0]!.id, "keep", 'the body says "dashboard panels"');
    expect(n.ok).toBe(true);
    expect(n.notes).toBe(1);
    expect(n.evidence_quality.quoted).toBe(true);
    const dir = join(ROOT, ".state", "council", c.id); // the file drop
    expect(existsSync(dir)).toBe(true);
    expect(readdirSync(dir).length).toBeGreaterThan(0);
  });
  it("4. compose: merge the verdicts into one decision", () => {
    // 4a. zero notes -> ok false, incomplete true, "no verdicts recorded".
    const empty = openCouncil(TASK, ROOT, { sessionId: `${SID}-empty` });
    delibIds.push(empty.id);
    const r0 = composeCouncil(empty.id, ROOT);
    expect(r0.ok).toBe(false);
    expect(r0.incomplete).toBe(true);
    expect(r0.message).toContain("no verdicts recorded");
    expect(r0.skill_id).toBe(null);
    // 4b. one note of N -> a decision, still incomplete, message says how many.
    const c = openCouncil(TASK, ROOT, { sessionId: SID });
    delibIds.push(c.id);
    recordNote(c.id, c.candidates[0]!.id, "keep", 'the body says "dashboard panels"');
    const r1 = composeCouncil(c.id, ROOT);
    expect(r1.ok).toBe(true);
    expect(r1.incomplete).toBe(true);
    expect(r1.skill_id).toBe(c.candidates[0]!.id);
    expect(r1.message).toContain("incomplete:");
    expect(r1.message).toContain("have verdicts");
    expect(r0.message).not.toBe(r1.message); // the two messages differ
    expect(r1.dissent.length).toBe(c.candidates.length - 1); // un-noted dropped
    expect(r1.brief.length).toBeGreaterThan(0);
  });
  it("5. phase_done: gates + slop + session lock release", async () => {
    const pass = runGates(["echo integration-gate-ok"], ROOT);
    expect(pass.pass).toBe(true);
    expect(pass.output).toContain("integration-gate-ok");
    const fail = runGates(["exit 3"], ROOT);
    expect(fail.pass).toBe(false);
    expect(fail.output).toContain("FAILED");
    // Lock a skill into the temp session so phase_done finds an active skill.
    expect(lockSkill(SID, CARD)).toBe(true);
    expect(getSession(SID).active_skill).toBe(CARD);
    const text = await mcpTool("phase_done", { session_id: SID, touched_files: [] });
    expect(text).toContain("phase closed pass=");
    expect(text).toMatch(/pass=(true|false)/);
    expect(text).toContain("gates pass=");
    expect(text).toContain("slop pass=");
    expect(text).toContain(CARD);
    expect(getSession(SID).active_skill).toBe(null); // lock released
    expect(getSession(SID).phase).toBeGreaterThan(1);
  });
  it("6. deliver: byte-capped body with a SECTIONS header", () => {
    const tierA = cards.find((c) => c.id === CARD)!;
    expect(tierA.tier).toBe("A");
    const { body, bytes } = loadBody(tierA, DELIVER_CAP, "design a landing page for a repair shop");
    expect(bytes).toBeLessThanOrEqual(3000);
    expect(Buffer.byteLength(body, "utf8")).toBeLessThanOrEqual(3000);
    expect(body).toContain("SECTIONS:");
    expect(body).toContain("STYLE:");
  });
  it("7. get_ref: fetch one section by name", () => {
    const card = cards.find((c) => c.id === CARD)!;
    expect(card.sections!.some((s) => s.name === SECTION)).toBe(true);
    const text = fetchRef(CARD, SECTION).content.map((c) => c.text).join("\n");
    expect(text).toContain(`## ${SECTION}`);
    for (const s of card.sections!.filter((s) => s.name !== SECTION)) {
      expect(text).not.toContain(`## ${s.name}`); // only this section
    }
    // A path that leaves the skill directory is refused.
    expect(() => fetchRef(CARD, "../../../../Windows/win.ini")).toThrow("ref not found");
    expect(() => fetchRef(CARD, "C:/Windows/win.ini")).toThrow("ref not found");
    expect(() => fetchRef("no__such_skill", "x")).toThrow("unknown skill");
  });
  it("8. doctor: install health", async () => {
    const proc = spawn("bun", ["src/cli.ts", "doctor"], { cwd: ROOT, stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    proc.stdout.on("data", (d: Buffer) => { out += d.toString(); });
    proc.stderr.on("data", (d: Buffer) => { out += d.toString(); });
    const code = await new Promise<number>((res) => proc.on("close", (c) => res(c ?? -1)));
    expect(code).toBe(0);
    expect(out).toContain("cards check ok=");
  }, 120000);
});
