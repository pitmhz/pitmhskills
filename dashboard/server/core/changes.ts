import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { STATE } from "../adapter/repo.ts";

export type Change = {
  time: string; op: string; ids: string[]; files: string[];
  sha_before?: Record<string, string | null>; sha_after?: Record<string, string | null>;
  post?: { step: string; code: number }[]; trash?: string; note?: string; diff?: string;
};

const LOG = join(STATE, "changes.jsonl");

/** One JSON line per mutation in dashboard/.state/changes.jsonl. */
export function logChange(c: Omit<Change, "time">): Change {
  const entry = { time: new Date().toISOString(), ...c };
  appendFileSync(LOG, JSON.stringify(entry) + "\n");
  return entry;
}

export function recentChanges(limit = 100, id?: string): Change[] {
  if (!existsSync(LOG)) return [];
  const out: Change[] = [];
  for (const line of readFileSync(LOG, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const c = JSON.parse(line) as Change;
      if (!id || c.ids.includes(id)) out.push(c);
    } catch { /* skip a torn line */ }
  }
  return out.reverse().slice(0, limit);
}
