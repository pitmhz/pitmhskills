// Sweep the score weights against the tune and held-out sets.
//
// Retrieval does not depend on the weights, so the expensive part runs once
// per task and every weight set is then applied to the cached signals.
// A full sweep of a few hundred configs finishes in seconds instead of hours.
//
// Read-only: never writes config.json.

import { openDb, initDb, loadConfig } from "./db.ts";
import { detectSignals } from "./signals.ts";
import { hardFilter } from "./gate.ts";
import { retrieveWith, loadAllCards } from "./retrieve.ts";
import { getLexicon } from "./lexicon-stats.ts";
import { shortlist } from "./collapse.ts";
import { scoreSignals, applyWeights, type ScoreSignals } from "./scoring.ts";
import type { Weights } from "./weights.ts";
import { loadTune, loadHeldout, loadVerbose } from "./eval.ts";
import { loadProfile } from "./profile.ts";

const cwd = process.cwd();
const tune = loadTune();
const heldout = loadHeldout();
const cfg = loadConfig();

interface Prepared { task: string; expect: string; signals: ScoreSignals[] }

function prepare(cases: { task: string; expect: string }[]): Prepared[] {
  const db = openDb();
  try {
    initDb(db);
    const sig = detectSignals(cwd);
    let profile = null;
    try { profile = loadProfile(cwd); } catch { profile = null; }
    const boosts = new Map<string, number>();
    if (profile) for (const p of profile.preferred ?? []) boosts.set(p.id, p.boost ?? 0.1);
    const all = loadAllCards(db);
    // Same corpus the router uses for IDF: the full A+B pool.
    const lex = getLexicon(all.filter((c) => c.tier === "A" || c.tier === "B"));
    const depth = (cfg.score_pool as number) ?? 40;
    const maxIdf = lex.maxIdf;
    return cases.map((g) => {
      const { kept: kept2 } = hardFilter(all, g.task, sig, profile);
      const pool2 = kept2.filter((c) => c.tier === "A" || c.tier === "B");
      const ranked = retrieveWith(db, g.task, pool2, { topK: depth, boosts, lex, queryTerms: (cfg.query_terms as number) ?? 12 });
      const sl = shortlist(ranked, { maxPerCluster: (cfg.max_per_cluster as number) ?? 3, maxTotal: depth });
      return { task: g.task, expect: g.expect, signals: scoreSignals(sl.kept, g.task, lex, 2, DECAY) };
    });
  } finally {
    try { db.close(); } catch { /* ignore */ }
  }
}

const t0 = performance.now();
const MAX_IDF = (() => {
  const db = openDb();
  try {
    initDb(db);
    return getLexicon(loadAllCards(db).filter((c) => c.tier === "A" || c.tier === "B")).maxIdf;
  } finally {
    try { db.close(); } catch { /* ignore */ }
  }
})();

// Signals depend on the position decay, so they are recomputed per decay.
let DECAY = 0.6;
let pTune = prepare(tune);
let pHeld = prepare(heldout);
let pVerb = prepare(loadVerbose());
console.log(`prepared ${pTune.length + pHeld.length} cases in ${((performance.now() - t0) / 1000).toFixed(1)}s maxIdf=${MAX_IDF.toFixed(2)}`);

function score(prepared: Prepared[], w: Weights, floor: number, margin: number, scale: number): number {
  let hit = 0;
  for (const p of prepared) {
    const ranked = applyWeights(p.signals, w, MAX_IDF, scale);
    const top = ranked[0];
    // Mirrors decide(): a card above the floor is a hit whether the outcome
    // is PICK or ASK - both carry a skill_id. Only below the floor is NONE.
    const got = top && top.score >= floor ? top.id : null;
    if ((got ?? "NONE") === p.expect) hit++;
  }
  void margin;
  return prepared.length ? hit / prepared.length : 0;
}

const results: { w: Weights; scale: number; floor: number; tune: number; held: number; verb: number; sum: number }[] = [];
for (const pd of [0, 0.3, 0.6, 0.9]) {
  DECAY = pd;
  pTune = prepare(tune);
  pHeld = prepare(heldout);
  pVerb = prepare(loadVerbose());
  for (const bm of [0.35, 0.45, 0.55, 0.65]) {
    for (const cov of [0.25, 0.4, 0.55]) {
      for (const vec of [0, 0.05, 0.15]) {
        if (bm + cov + vec > 1.0001) continue;
        for (const unk of [0.35, 0.6, 1.0]) {
          for (const rm of [0, 8]) {
            for (const scale of [6, 10, 16]) {
              for (const floor of [40, 45, 50, 55]) {
                const w: Weights = { bm25: bm, cover: cov, vec, unknown: unk, variant_unclaimed: 0, rare_match: rm, rare_df: 2, position_decay: pd };
                const t = score(pTune, w, floor, cfg.margin as number, scale);
                const h = score(pHeld, w, floor, cfg.margin as number, scale);
                const v = score(pVerb, w, floor, cfg.margin as number, scale);
                results.push({ w, scale, floor, tune: t, held: h, verb: v, sum: t + h + v });
              }
            }
          }
        }
      }
    }
  }
}
results.sort((a, b) => b.sum - a.sum || b.tune - a.tune);
console.log(`swept ${results.length} configs in ${((performance.now() - t0) / 1000).toFixed(1)}s`);
console.log("top 20 by (tune + heldout + verbose):");
for (const r of results.slice(0, 20)) {
  console.log(`  tune=${(r.tune * 100).toFixed(1)}% held=${(r.held * 100).toFixed(1)}% verb=${(r.verb * 100).toFixed(1)}%  bm25=${r.w.bm25} cover=${r.w.cover} vec=${r.w.vec} unk=${r.w.unknown} rm=${r.w.rare_match} pd=${r.w.position_decay} scale=${r.scale} floor=${r.floor}`);
}
console.log("\nbest by tune (tie-broken by heldout then verbose):");
for (const r of [...results].sort((a, b) => b.tune - a.tune || b.held - a.held || b.verb - a.verb).slice(0, 10)) {
  console.log(`  tune=${(r.tune * 100).toFixed(1)}% held=${(r.held * 100).toFixed(1)}% verb=${(r.verb * 100).toFixed(1)}%  bm25=${r.w.bm25} cover=${r.w.cover} vec=${r.w.vec} unk=${r.w.unknown} rm=${r.w.rare_match} pd=${r.w.position_decay} scale=${r.scale} floor=${r.floor}`);
}
console.log("\nconfigs with all three sets at 100%:");
const perfect = results.filter((r) => r.tune === 1 && r.held === 1 && r.verb === 1);
for (const r of perfect.slice(0, 12)) {
  console.log(`  bm25=${r.w.bm25} cover=${r.w.cover} vec=${r.w.vec} unk=${r.w.unknown} rm=${r.w.rare_match} rdf=${r.w.rare_df} scale=${r.scale} floor=${r.floor}`);
}
console.log(`  (${perfect.length} perfect configs)`);
