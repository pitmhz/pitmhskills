import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openDb } from "./db.ts";
import { loadSources } from "./ingest.ts";
import { shaFile, largestSourceFile } from "./index.ts";
import { summarizeUsage } from "./learn.ts";
import { loadAllCards } from "./retrieve.ts";

// doctor: install-health audit. Advisory only: read-only, always exits 0,
// output capped like other commands. Split out of cli.ts to hold the
// 200-line module cap.
export function runDoctor(): void {
  const CAP = 20;
  const cut = (s: string) => s.slice(0, 200);
  // 1. dead sources: zero route_logs skill_id-prefix hits in 14d.
  let dead: string[] = [];
  let sourceCount = 0;
  try {
    const ids = loadSources().map((s) => s.id);
    sourceCount = ids.length;
    const cutoff = Date.now() - 14 * 86400000;
    const db = openDb();
    try {
      const rows = db.query<{ skill_id: string | null }, number>(
        `SELECT skill_id FROM route_logs WHERE ts >= ?`
      ).all(cutoff) as { skill_id: string | null }[];
      const hits = new Set<string>();
      for (const r of rows) {
        if (!r.skill_id) continue;
        const src = String(r.skill_id).split("__")[0];
        if (src) hits.add(src);
      }
      dead = ids.filter((id) => !hits.has(id));
    } catch { dead = ids.slice(); }
    finally { try { db.close(); } catch { /* ignore */ } }
  } catch { dead = []; }
  console.log(`dead sources (14d, sources=${sourceCount} dead=${dead.length}):`);
  if (!dead.length) console.log("  none");
  for (const d of dead.slice(0, CAP)) console.log(`  dead: ${cut(d)}`);
  if (dead.length > CAP) console.log(`  ... and ${dead.length - CAP} more`);
  // 2. license: UNKNOWN count blocks Tier-A use.
  // 6. coverage: Tier-A counts per source (counts only; run `cover` for live self-route).
  let unknown: string[] = [];
  const tierA = new Map<string, number>();
  try {
    const db = openDb();
    try {
      for (const c of loadAllCards(db)) {
        if ((c.license ?? "UNKNOWN") === "UNKNOWN") unknown.push(c.id);
        if (c.tier === "A") {
          const src = c.id.split("__")[0] ?? "unknown";
          tierA.set(src, (tierA.get(src) ?? 0) + 1);
        }
      }
    } finally { try { db.close(); } catch { /* ignore */ } }
  } catch { /* keep empty */ }
  console.log(`license UNKNOWN (count=${unknown.length}):`);
  if (!unknown.length) console.log("  none");
  for (const id of unknown.slice(0, CAP)) console.log(`  license: ${cut(id)}`);
  if (unknown.length > CAP) console.log(`  ... and ${unknown.length - CAP} more`);
  // 3. stale: curated cards whose hash mismatches the current SKILL.md sha.
  let stale: string[] = [];
  try {
    const root = join(dirname(fileURLToPath(import.meta.url)), "..");
    const dir = join(root, "cards");
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) {
      try {
        const c = JSON.parse(readFileSync(join(dir, f), "utf8"));
        if (c?.curated !== true || !c.skill_path || !c.hash) continue;
        if (!existsSync(c.skill_path)) continue;
        const h = shaFile(c.skill_path);
        if (h && h !== c.hash) stale.push(c.id ?? f);
      } catch { /* skip unreadable card */ }
    }
  } catch { /* keep empty */ }
  console.log(`stale curated (count=${stale.length}):`);
  if (!stale.length) console.log("  none");
  for (const s of stale.slice(0, CAP)) console.log(`  stale: ${cut(s)}`);
  if (stale.length > CAP) console.log(`  ... and ${stale.length - CAP} more`);
  // 4. abstain: ABSTAIN rate from usage summary.
  let rate = 0, total = 0;
  try {
    const u = summarizeUsage(14);
    rate = u.abstainRate;
    total = u.total;
  } catch { /* keep zero */ }
  console.log(`abstain rate (14d): ${(rate * 100).toFixed(1)}% n=${total}`);
  // 5. size: src/*.ts files over 200 lines.
  let big: { file: string; lines: number }[] = [];
  try {
    big = largestSourceFile().filter((x) => x.lines > 200);
  } catch { big = []; }
  console.log(`size over 200 lines (count=${big.length}):`);
  if (!big.length) console.log("  none");
  for (const b of big.slice(0, CAP)) console.log(`  size: ${cut(b.file)} ${b.lines} lines`);
  const cov = [...tierA.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const covTotal = cov.reduce((a, [, n]) => a + n, 0);
  console.log(`coverage Tier-A per-source (cards=${covTotal} sources=${cov.length}, counts only):`);
  if (!cov.length) console.log("  none");
  for (const [s, n] of cov.slice(0, CAP)) console.log(`  ${cut(s)}: ${n}`);
  if (cov.length > CAP) console.log(`  ... and ${cov.length - CAP} more`);
}
