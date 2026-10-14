import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const STATE = join(ROOT, ".state");

interface Session { active_skill: string | null; phase: number; phases: number; retries: number }

// Skill lock: max 1 active skill body per phase. Second skill needs phase switch.
export function getSession(id: string): Session {
  mkdirSync(STATE, { recursive: true });
  const p = join(STATE, `${id}.json`);
  if (!existsSync(p)) return { active_skill: null, phase: 1, phases: 1, retries: 0 };
  try { return JSON.parse(readFileSync(p, "utf8")) as Session; } catch { return { active_skill: null, phase: 1, phases: 1, retries: 0 }; }
}

export function lockSkill(id: string, skill: string): boolean {
  const s = getSession(id);
  if (s.active_skill && s.active_skill !== skill) return false;
  s.active_skill = skill;
  writeFileSync(join(STATE, `${id}.json`), JSON.stringify(s, null, 2));
  return true;
}

export function phaseDone(id: string): void {
  const s = getSession(id);
  s.active_skill = null;
  s.phase += 1;
  s.retries = 0;
  writeFileSync(join(STATE, `${id}.json`), JSON.stringify(s, null, 2));
}

export function recordRetry(id: string): number {
  const s = getSession(id);
  s.retries += 1;
  writeFileSync(join(STATE, `${id}.json`), JSON.stringify(s, null, 2));
  return s.retries;
}
