import { spawn } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { lintMandate } from "../server/adapter/mandate.ts";

// Smoke: boots the real server on a spare port and checks the PRD 12.1 KPIs that need no browser.
const DASH = join(import.meta.dirname, "..");
const PORT = 4400 + Math.floor(Math.random() * 400);
const base = `http://127.0.0.1:${PORT}`;
let failed = 0;
const ok = (cond: boolean, msg: string) => { console.log(`${cond ? "ok  " : "FAIL"} ${msg}`); if (!cond) failed++; };

const srv = spawn(process.execPath, ["server/index.ts"], { cwd: DASH, env: { ...process.env, PORT: String(PORT) }, stdio: ["ignore", "pipe", "inherit"] });
await new Promise<void>((done, fail) => {
  const t = setTimeout(() => fail(new Error("server did not start")), 15000);
  srv.stdout!.on("data", (b) => { if (String(b).includes("dashboard on")) { clearTimeout(t); done(); } });
});

try {
  const token = readFileSync(join(DASH, ".state", "token"), "utf8");
  const get = (p: string) => fetch(base + p);
  const post = (p: string, body: unknown, tok = token) =>
    fetch(base + p, { method: "POST", headers: { "content-type": "application/json", "x-dash-token": tok }, body: JSON.stringify(body) });

  const caps = await (await get("/api/capabilities")).json();
  ok(Object.keys(caps.flags).length === 13, "capabilities: 13 flags");

  const files = readdirSync(join(DASH, "..", "cards")).filter((f) => f.endsWith(".json")).length;
  const audit = await (await get("/api/audit")).json();
  ok(Math.abs(audit.total - files) / files <= 0.01, `audit total ${audit.total} vs ${files} card files (within 1%)`);

  const t0 = Date.now();
  const res = await get("/api/skills?size=100");
  const text = await res.text();
  const ms = Date.now() - t0;
  ok(text.length <= 200 * 1024, `/api/skills payload ${text.length} B <= 200 KB`);
  ok(!text.includes('"body"'), "/api/skills has no bodies");
  ok(ms <= 1500, `/api/skills first page ${ms} ms (warm target 200 ms)`);

  ok((await post("/api/route", { task: "x y" }, "wrong")).status === 403, "non-GET without token -> 403");
  ok((await fetch(base + "/api/audit", { headers: { origin: "http://evil.test" } })).status === 403, "foreign Origin -> 403");

  for (const task of ["add scroll animation to a landing page", "quantum chromodynamics simulation", "wordpress theme development"]) {
    const r = await (await post("/api/route", { task })).json();
    ok(["PICK", "ASK", "ABSTAIN", "LEGACY_LIST"].includes(r.outcome) && Array.isArray(r.picks), `route "${task}" -> ${r.outcome} ${r.picks?.[0]?.id ?? ""}`);
  }

  const pass = [
    "Call `route` with every task; use only the returned skill. If ABSTAIN proceed bare.",
    "# Mandate\nRun `route` first. Never list or search skills yourself.",
    "Before coding, call route with the task.\nUse the one skill it returns.",
    "Use `route`. If ASK, ask the user. If ABSTAIN, proceed without a skill.",
  ];
  const fail = [
    "Before coding, load all skills and pick the best.",
    "Do the task well.",
    "Call route.\n" + "x".repeat(1100),
    "Call route.\n---\nname: gsap\ndescription: pasted skill",
  ];
  const blocks = (t: string) => lintMandate(t).some((l) => l.level === "error" && !l.ok);
  const acc = pass.filter((t) => !blocks(t)).length + fail.filter(blocks).length;
  ok(acc === 8, `mandate lint accuracy ${acc}/8`);
} finally {
  srv.kill();
}
if (failed) { console.log(`${failed} smoke check(s) failed`); process.exit(1); }
console.log("smoke passed");
