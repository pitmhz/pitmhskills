import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { routeWith } from "./route.ts";
import { loadTune } from "./eval.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Fit floor/margin on TUNE set only (never held-out). Scores through routeWith —
// the same pipeline eval uses (ASK carries a skill_id, lock off, no log noise) —
// so the fitted optimum transfers to live routing. Refit in CI, never hand-tune.
export function calibrate(cwd: string): { floor: number; margin: number; top1: number } {
  const gold = loadTune();
  let best = { floor: 60, margin: 10, top1: -1 };
  for (const floor of [40, 50, 60, 70]) {
    for (const margin of [10, 15, 20]) {
      let hit = 0;
      for (const g of gold) {
        const r = routeWith(g.task, cwd, { sessionId: "calibrate", lock: false, log: false, floor, margin });
        const got = r.skill_id ?? "NONE";
        if (got === g.expect) hit++;
      }
      const top1 = gold.length ? hit / gold.length : 0;
      if (top1 > best.top1) best = { floor, margin, top1 };
    }
  }
  const cfgPath = join(ROOT, "config.json");
  const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
  cfg.floor = best.floor;
  cfg.margin = best.margin;
  writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + "\n");
  return best;
}
