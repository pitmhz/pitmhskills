// Deploy the canonical skill-router body to every place that loads it, and
// refresh the card hash so `cards --check` stays clean.
//
// There used to be two different routers on this machine and the agent
// picked whichever it saw first:
//   - the global skill body said "run python server/scripts/resolve_skill.py"
//     (a cwd-relative path that only resolves inside the pitmry repo)
//   - the pitmry skill body and the codex hook said "run the bun CLI"
//
// Both now come from this repo. Run this after editing skill-router/SKILL.md.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "skill-router", "SKILL.md");

// Every location that loads the skill-router body.
const TARGETS = [
  join(process.env.USERPROFILE ?? "", "skills", "skill-router", "SKILL.md"),
  join(process.env.USERPROFILE ?? "", "pitmry", "skills", "skill-router", "SKILL.md"),
];

// The card whose skill_path points at the deployed body.
const CARD = join(ROOT, "cards", "local__skill-router.json");

function sha256(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

export function syncSkillRouter(): { deployed: string[]; hash: string } {
  if (!existsSync(SRC)) throw new Error(`missing canonical body: ${SRC}`);
  const body = readFileSync(SRC, "utf8");
  const deployed: string[] = [];
  for (const t of TARGETS) {
    if (!t) continue;
    try {
      mkdirSync(dirname(t), { recursive: true });
      writeFileSync(t, body, "utf8");
      deployed.push(t);
    } catch (e) {
      console.error(`skip ${t}: ${(e as Error).message}`);
    }
  }
  // Card hash tracks the deployed body so `cards --check` does not report a
  // stale skill.
  const hash = sha256(body);
  if (existsSync(CARD)) {
    const card = JSON.parse(readFileSync(CARD, "utf8")) as Record<string, unknown>;
    card["hash"] = hash;
    writeFileSync(CARD, JSON.stringify(card, null, 2) + "\n", "utf8");
  }
  return { deployed, hash };
}

if (import.meta.main) {
  const r = syncSkillRouter();
  for (const d of r.deployed) console.log(`deployed ${d}`);
  console.log(`hash ${r.hash}`);
}
