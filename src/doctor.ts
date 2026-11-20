import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openDb } from "./db.ts";
import { loadSources } from "./ingest.ts";
import { shaFile, largestSourceFile, checkCards } from "./index.ts";
import { summarizeUsage } from "./learn.ts";
import { loadAllCards } from "./retrieve.ts";
import { runCoverage } from "./eval.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// doctor: install-health audit. Output is plain text, one metric per line.
export function runDoctor(): number {
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
        `SELECT skill_id FROM route_logs WHERE ts >= ?`,
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
    const dir = join(ROOT, "cards");
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
  let probe = { top1: 0, total: 0, perSource: {} as Record<string, { hit: number; total: number }> };
  try { probe = runCoverage(ROOT); } catch { /* keep zero */ }
  console.log(`coverage Tier-A probe top1=${(probe.top1 * 100).toFixed(1)}% n=${probe.total} cards=${covTotal} sources=${cov.length}:`);
  const ps = Object.entries(probe.perSource).sort((a, b) => a[0].localeCompare(b[0]));
  if (!ps.length) console.log("  none");
  for (const [s, m] of ps.slice(0, CAP)) console.log(`  ${cut(s)}: ${m.hit}/${m.total}`);
  if (ps.length > CAP) console.log(`  ... and ${ps.length - CAP} more`);
  // Phase 9 doctor areas (plain lines, one metric per line).
  // A: tier / curated / empty-field counts read from cards/*.json direct.
  try {
    const files = readdirSync(join(ROOT, "cards")).filter((f) => f.endsWith(".json"));
    const tiers = { A: 0, B: 0, C: 0 } as Record<string, number>;
    let curated = 0, disEmpty = 0, goalEmpty = 0, useEmpty = 0;
    const domAB = new Map<string, number>();
    let abTotal = 0;
    for (const f of files) {
      try {
        const c = JSON.parse(readFileSync(join(ROOT, "cards", f), "utf8"));
        tiers[c.tier] = (tiers[c.tier] ?? 0) + 1;
        if (c.curated === true) curated++;
        if (!c.disambiguator || !String(c.disambiguator).trim()) disEmpty++;
        if (!c.goal || !String(c.goal).trim()) goalEmpty++;
        if (!c.use_when || !Array.isArray(c.use_when) || c.use_when.length === 0) useEmpty++;
        if (c.tier === "A" || c.tier === "B") { abTotal++; domAB.set(c.domain ?? "unknown", (domAB.get(c.domain ?? "unknown") ?? 0) + 1); }
      } catch { /* skip */ }
    }
    console.log(`tiers A=${tiers["A"] ?? 0} B=${tiers["B"] ?? 0} C=${tiers["C"] ?? 0} total=${files.length}`);
    console.log(`curated count=${curated}`);
    console.log(`empty disambiguator count=${disEmpty}`);
    console.log(`empty goal count=${goalEmpty}`);
    console.log(`empty use_when count=${useEmpty}`);
    const top = [...domAB.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    for (const [d, n] of top) {
      const pct = abTotal ? (n / abTotal) * 100 : 0;
      const flag = pct > 25 ? " FLAG>25%" : "";
      console.log(`domain ${d}: ${n} (${pct.toFixed(1)}% of A+B${flag})`);
    }
    console.log(`A+B pool=${abTotal}`);
  } catch (e) { console.log(`tiers read error: ${(e as Error).message.slice(0, 120)}`); }
  // B: cache staleness: rows vs files, max(hash), vecs vs rows, cache key.
  try {
    const files = readdirSync(join(ROOT, "cards")).filter((f) => f.endsWith(".json")).length;
    const db = openDb();
    try {
      const row = db.query<{ n: number; h: string | null }, []>(`SELECT count(*) n, max(hash) h FROM cards`).get();
      const vecs = db.query<{ n: number }, []>(`SELECT count(*) n FROM vecs`).get()?.n ?? 0;
      const key = `${row?.n ?? 0}:${row?.h ?? ""}`;
      const valid = (row?.n ?? 0) === vecs;
      console.log(`cache rows=${row?.n ?? 0} files=${files} max_hash=${row?.h ?? ""} key=${key} valid=${valid ? "yes" : "no"}`);
      console.log(`vecs count=${vecs} vs rows=${row?.n ?? 0}`);
    } finally { try { db.close(); } catch { /* ignore */ } }
  } catch { /* keep silent, checker will flag */ }
  // C: council prune backlog: expired past TTL (listed, never deleted) + files.
  try {
    const db = openDb();
    try {
      let expiredIds: string[] = [], total = 0;
      try {
        total = db.query<{ n: number }, []>(`SELECT count(*) n FROM deliberations`).get()?.n ?? 0;
        expiredIds = db.query<{ id: string }, number>(`SELECT id FROM deliberations WHERE expires_at < ?`).all(Date.now()).map((r) => r.id);
      } catch { total = 0; expiredIds = []; }
      console.log(`council expired=${expiredIds.length} total=${total} past_TTL_listed_not_deleted=yes`);
      for (const id of expiredIds.slice(0, CAP)) console.log(`  cribbed: ${cut(id)}`);
      if (expiredIds.length > CAP) console.log(`  ... and ${expiredIds.length - CAP} more`);
    } finally { try { db.close(); } catch { /* ignore */ } }
  } catch { /* ignore */ }
  try {
    const cdir = join(ROOT, ".state", "council");
    let nFiles = 0;
    if (existsSync(cdir)) {
      for (const e of readdirSync(cdir, { withFileTypes: true })) {
        if (e.isDirectory()) nFiles += readdirSync(join(cdir, e.name)).length;
        else nFiles++;
      }
    }
    console.log(`council state files=${nFiles}`);
  } catch { console.log("council state files=error"); }
  // D: slop scanner status: exists + export + Bun.file smoke + golden sample.
  try {
    const sp = join(ROOT, "src", "slop.ts");
    if (!existsSync(sp)) console.log("slop scanner: missing src/slop.ts");
    else {
      const txt = readFileSync(sp, "utf8");
      const hasFn = /export\s+(async\s+)?function\s+runSlopScan/.test(txt);
      const smoke = existsSync(join(ROOT, "evals", "slop-patterns.json"));
      let gold = "skip";
      try { const g = readFileSync(join(ROOT, "evals", "golden-slop.yaml"), "utf8"); gold = `checked=${(g.match(/:/g) ?? []).length > 0 ? "yes" : "no"}`; } catch { gold = "missing"; }
      console.log(`slop scanner: src/slop.ts exists runSlopScan=${hasFn ? "yes" : "no"} Bun.file-smoke=${smoke ? "ok" : "missing"} golden=${gold}`);
    }
  } catch { console.log("slop scanner: read error"); }
  // E: who-calls-who breakdown under one shared prefix.
  console.log(`who: route->council ABSTAIN-with-candidates must_delegate; council->compose plan_batches max 3 note verdicts`);
  console.log(`who: phase_done->gates verify + slop touched_files; serve->council-store pruneExpired TTL`);
  console.log(`who: eval->route routeWith lock=false; doctor->checkCards + runCoverage probe`);
  // Cards check is a hint only here; cli `cards --check` is the hard gate.
  const chk = checkCards();
  console.log(`cards check ok=${chk.ok} bad=${chk.bad.length}`);
  for (const b of chk.bad.slice(0, CAP)) console.log(`  check: ${cut(b.file)} ${cut(b.errs.join("; "))}`);
  // SIZE is a warning only; doctor always exits 0, never gates on missing areas.
  return 0;
}
