import { createHash } from "node:crypto";
import { openDb, initDb } from "./db.ts";

// Harness manifest check: data in harness-manifest.json, logic here.
// This guards agent read tools (read/glob/grep on files). It does NOT
// guard MCP tools. get_ref is the only sanctioned body fetch and stays
// allowed; never call this check on a get_ref path to block it.

export function logDeny(path: string): void {
  try {
    const db = openDb();
    try {
      initDb(db);
      const h = createHash("sha256").update(path).digest("hex").slice(0, 16);
      db.prepare(
        `INSERT INTO route_logs (ts, task_hash, outcome, skill_id, confidence) VALUES (?, ?, ?, ?, ?)`
      ).run(Date.now(), h, "DENY", path, 0);
    } finally {
      db.close();
    }
  } catch {
    // Logging must never break routing or the check itself.
  }
}

export function checkHarnessManifest(path: string): { allowed: boolean; reason: string } {
  const p = path.replace(/\\/g, "/");
  // Deny any raw skill body: SKILL.md at root or under any folder.
  if (p === "SKILL.md" || p.endsWith("/SKILL.md")) {
    const reason = "read of **/SKILL.md is denied; use get_ref for a routed skill body";
    logDeny(path);
    return { allowed: false, reason };
  }
  // Allow card files explicitly. All other paths are allowed by default.
  if (/^cards\/[^/]+\.json$/.test(p)) {
    return { allowed: true, reason: "cards/*.json is allowed" };
  }
  return { allowed: true, reason: "allowed by default" };
}
