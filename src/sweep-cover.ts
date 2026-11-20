// For every golden case, report the coverage of the EXPECTED card and of the
// card that actually wins. A coverage threshold can only be safe if it sits
// below the lowest coverage among the cards that must win.
import { openDb, initDb, loadConfig } from "./db.ts";
import { detectSignals } from "./signals.ts";
import { hardFilter } from "./gate.ts";
import { retrieveWith, loadAllCards } from "./retrieve.ts";
import { getLexicon } from "./lexicon-stats.ts";
import { shortlist } from "./collapse.ts";
import { scoreSignals, applyWeights } from "./scoring.ts";
import { loadTune, loadHeldout } from "./eval.ts";
import { loadProfile } from "./profile.ts";

const cwd = process.cwd();
const cfg = loadConfig();
const weights = (cfg.weights as never) ?? { bm25: 0.55, cover: 0.4, vec: 0.05, unknown: 0.35, variant_unclaimed: 0 };

const db = openDb();
initDb(db);
const sig = detectSignals(cwd);
let profile = null;
try { profile = loadProfile(cwd); } catch { profile = null; }
const boosts = new Map<string, number>();
if (profile) for (const p of profile.preferred ?? []) boosts.set(p.id, p.boost ?? 0.1);
const all = loadAllCards(db);
const lex = getLexicon(all.filter((c) => c.tier === "A" || c.tier === "B"));
const depth = (cfg.score_pool as number) ?? 40;

const rows: { task: string; expect: string; wantCover: number; wantScore: number; gotCover: number; gotScore: number; got: string; inShortlist: boolean }[] = [];

for (const g of [...loadTune(), ...loadHeldout()]) {
  const { kept } = hardFilter(all, g.task, sig, profile);
  const pool = kept.filter((c) => c.tier === "A" || c.tier === "B");
  const ranked = retrieveWith(db, g.task, pool, { topK: depth, boosts, lex, queryTerms: (cfg.query_terms as number) ?? 12 });
  const sl = shortlist(ranked, { maxPerCluster: (cfg.max_per_cluster as number) ?? 8, maxTotal: depth });
  const signals = scoreSignals(sl.kept, g.task, lex);
  const scored = applyWeights(signals, weights, lex.maxIdf);
  const want = scored.find((s) => s.id === g.expect);
  const got = scored[0];
  rows.push({
    task: g.task,
    expect: g.expect,
    wantCover: want ? want.detail.cover : -1,
    wantScore: want ? want.score : -1,
    gotCover: got ? got.detail.cover : -1,
    gotScore: got ? got.score : -1,
    got: got ? got.id : "NONE",
    inShortlist: !!want,
  });
}

const winners = rows.filter((r) => r.expect !== "NONE" && r.inShortlist);
const minWant = Math.min(...winners.map((r) => r.wantCover));
console.log(`cases=${rows.length} withExpectedInShortlist=${winners.length}`);
console.log(`lowest coverage among cards that MUST win: ${minWant.toFixed(3)}`);
console.log("\nlowest 12 winner coverages:");
for (const r of [...winners].sort((a, b) => a.wantCover - b.wantCover).slice(0, 12)) {
  console.log(`  cover=${r.wantCover.toFixed(3)} score=${r.wantScore}  ${r.expect}  <- "${r.task.slice(0, 58)}"`);
}
console.log("\nNONE cases: highest winning score (these must stay under the floor):");
for (const r of rows.filter((x) => x.expect === "NONE").sort((a, b) => b.gotScore - a.gotScore).slice(0, 8)) {
  console.log(`  score=${r.gotScore} cover=${r.gotCover.toFixed(3)}  ${r.got}  <- "${r.task.slice(0, 58)}"`);
}
console.log("\nfailures:");
for (const r of rows.filter((x) => (x.gotScore >= (cfg.floor as number) ? x.got : "NONE") !== x.expect)) {
  console.log(`  want=${r.expect} (cover ${r.wantCover.toFixed(3)} score ${r.wantScore}) got=${r.got} (cover ${r.gotCover.toFixed(3)} score ${r.gotScore}) <- "${r.task.slice(0, 58)}"`);
}
db.close();
