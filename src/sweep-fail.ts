// Show where the expected card sits for every failing case: is it in the
// shortlist at all, and what score does it get?
import { openDb, initDb, loadConfig } from "./db.ts";
import { detectSignals } from "./signals.ts";
import { hardFilter } from "./gate.ts";
import { retrieveWith, loadAllCards } from "./retrieve.ts";
import { getLexicon } from "./lexicon-stats.ts";
import { shortlist } from "./collapse.ts";
import { scoreSignals, applyWeights } from "./scoring.ts";
import { DEFAULT_WEIGHTS } from "./weights.ts";
import { loadTune, loadHeldout } from "./eval.ts";
import { loadProfile } from "./profile.ts";

const cwd = process.cwd();
const cfg = loadConfig();
const only = process.argv[2] ?? "heldout";
const cases = only === "tune" ? loadTune() : loadHeldout();

const db = openDb();
initDb(db);
const sig = detectSignals(cwd);
let profile = null;
try { profile = loadProfile(cwd); } catch { profile = null; }
const boosts = new Map<string, number>();
if (profile) for (const p of profile.preferred ?? []) boosts.set(p.id, p.boost ?? 0.1);
const all = loadAllCards(db);
const { kept: keptAll } = hardFilter(all, "a b c d e f g", sig, profile);
const poolAll = keptAll.filter((c) => c.tier === "A" || c.tier === "B");
const lex = getLexicon(poolAll);
const depth = (cfg.score_pool as number) ?? 40;

for (const g of cases) {
  const { kept } = hardFilter(all, g.task, sig, profile);
  const pool = kept.filter((c) => c.tier === "A" || c.tier === "B");
  const ranked = retrieveWith(db, g.task, pool, { topK: depth, boosts, lex, queryTerms: (cfg.query_terms as number) ?? 12 });
  const sl = shortlist(ranked, { maxPerCluster: (cfg.max_per_cluster as number) ?? 3, maxTotal: depth });
  const signals = scoreSignals(sl.kept, g.task, lex);
  const scored = applyWeights(signals, DEFAULT_WEIGHTS, lex.maxIdf);
  const got = scored[0] && scored[0].score >= (cfg.floor as number) ? scored[0].id : "NONE";
  if (got === g.expect) continue;
  const rank = scored.findIndex((s) => s.id === g.expect);
  const inShortlist = rank >= 0;
  const inRetrieve = ranked.findIndex((r) => r.card.id === g.expect);
  const bmRank = ranked.find((r) => r.card.id === g.expect);
  console.log(`\nTASK: ${g.task}`);
  console.log(`  want ${g.expect}  got ${got}`);
  console.log(`  expected card: retrieveRank=${inRetrieve} shortlistRank=${rank}`);
  if (bmRank) console.log(`  expected bm25=${bmRank.bm25.toFixed(1)} fused=${bmRank.fused.toFixed(3)} tier=${bmRank.card.tier} cluster=${bmRank.card.cluster}`);
  if (inShortlist) {
    const s = scored[rank]!;
    console.log(`  expected score=${s.score} bm=${s.detail.bm.toFixed(2)} cover=${s.detail.cover.toFixed(2)} vec=${s.detail.vec.toFixed(2)} clause=${s.detail.clause.toFixed(0)} phrase=${s.phrase} pred=${s.detail.predBonus} gen=${s.genericOnly} matched=[${s.matched.join(",")}]`);
  }
  for (const s of scored.slice(0, 3)) console.log(`    top: ${s.id} score=${s.score} bm=${s.detail.bm.toFixed(2)} cover=${s.detail.cover.toFixed(2)} matched=[${s.matched.join(",")}]`);
}
db.close();
