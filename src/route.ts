import { createHash } from "node:crypto";
import { openDb, initDb, loadConfig } from "./db.ts";
import { detectSignals } from "./signals.ts";
import { hardFilter } from "./gate.ts";
import { retrieveWith, loadAllCards } from "./retrieve.ts";
import { getLexicon } from "./lexicon-stats.ts";
import { shortlist } from "./collapse.ts";
import { scoreCandidates, decide, buildAskQuestion } from "./decide.ts";
import { DEFAULT_WEIGHTS } from "./weights.ts";
import type { Weights } from "./weights.ts";
import { loadBody, scopeFence, pairGuard, DELIVER_CAP } from "./deliver.ts";
import { loadProfile } from "./profile.ts";
import type { RepoProfile } from "./profile.ts";
import { lockSkill, getSession } from "./session.ts";
import { pruneExpired } from "./council-store.ts";
import { recordOffer } from "./analytics.ts";
import { abstainResult } from "./route-abstain.ts";
import type { Card, RouteResult } from "./types.ts";

// route(): filter -> retrieve -> collapse -> decide -> deliver. No LLM on hot path.
// Enforces the session lock: max 1 active skill per phase; a different pick while
// locked is still returned but flagged (caller must phase_done first).
export function route(task: string, cwd: string, sessionId = "default"): RouteResult {
  return routeWith(task, cwd, { sessionId });
}

export function routeWith(
  task: string,
  cwd: string,
  o: { sessionId?: string; lock?: boolean; floor?: number; margin?: number; log?: boolean; weights?: Weights; bm25Scale?: number }
): RouteResult {
  const sessionId = o.sessionId ?? "default";
  const doLock = o.lock !== false;
  const doLog = o.log !== false;
  const cfg = loadConfig();
  const floor = o.floor ?? (cfg.floor as number);
  const margin = o.margin ?? (cfg.margin as number);
  const pickFloor = cfg.pick_floor as number;
  // A near candidate only justifies a council when it is close to the floor.
  // Without this bar every ABSTAIN with any candidate row forced a council,
  // so ordering a pizza opened a skill council.
  const nearFloor = (cfg.near_floor as number) ?? floor * 0.6;
  // Merge over the defaults: a config that names three of five weights must
  // not silently produce NaN. A NaN score fails every comparison and the
  // router abstains on everything.
  const weights: Weights = { ...DEFAULT_WEIGHTS, ...(o.weights ?? {}), ...((cfg.weights as unknown as Partial<Weights>) ?? {}) };
  const db = openDb();
  initDb(db);
  const t0 = performance.now();
  try { pruneExpired(db); } catch { /* ignore */ }
  const sig = detectSignals(cwd);
  const all = loadAllCards(db);
  // Repo profile: blocked ids filtered in gate, preferred ids boosted in retrieve.
  // Corrupt/missing profile must never break routing.
  let profile: RepoProfile | null = null;
  try {
    profile = loadProfile(cwd);
  } catch { profile = null; }
  const boosts = new Map<string, number>();
  if (profile) for (const p of profile.preferred ?? []) boosts.set(p.id, p.boost ?? 0.1);
  const { kept } = hardFilter(all, task, sig, profile);
  // Tier A first; fall through to B only if no A clears floor later
  // Joint search over all returnable cards (A+B); Tier A gets a small boost.
  // Two-stage (A first, fall through to B) is a scale optimization for 100+ skills.
  const pool = kept.filter((c) => c.tier === "A" || c.tier === "B");
  // IDF comes from the WHOLE corpus, never from the task-filtered pool. The
  // filter drops a handful of cards per task, and a per-task corpus would
  // give every task its own idea of how rare a word is - so the same word
  // scored differently on different tasks, and the cache never hit.
  const lex = getLexicon(all.filter((c) => c.tier === "A" || c.tier === "B"));
  // Retrieve DEEP, score WIDE. The old top-12 cut dropped exact-match cards
  // (e.g. the only card mentioning "wizard") before the scorer ever saw them.
  const depth = (cfg.score_pool as number) ?? 40;
  const ranked = retrieveWith(db, task, pool, { topK: depth, boosts, lex, bm25Scale: o.bm25Scale, queryTerms: (cfg.query_terms as number) ?? 12, matchTrim: (cfg.match_trim as "known" | "rare") ?? "known" });
  // Category diversity cap. Clusters are categories, not rivalry groups, so
  // several skills from one category may compete - but only a few, so the
  // agent is never handed a wall of nvidia/postgres cards.
  const sl = shortlist(ranked, { maxPerCluster: (cfg.max_per_cluster as number) ?? 3, maxTotal: depth, task, lex });
  const collapsed = sl.kept;
  const ranking = scoreCandidates(collapsed, task, lex, weights);
  const d = decide(ranking, collapsed, floor, margin, pickFloor, (cfg.ask_min_margin as number) ?? 3);
  const byId = new Map(collapsed.map((r) => [r.card.id, r]));
  if (d.outcome === "ABSTAIN" || !d.top) {
    if (doLog) log(db, task, "ABSTAIN", null, d.top?.score ?? 0);
    // A council hint: the candidates that are close but did not clear the
    // floor. The deterministic router could not decide, so the next step is
    // a reader, not another guess. `council` opens it.
    const near = ranking.slice(0, 3).map((r) => ({ id: r.id, score: r.score, reason: r.reason }));
    const abstainConf = d.top?.score ?? 0;
    recordOffer({ db, task, outcome: "ABSTAIN", skillId: null, confidence: abstainConf, margin: d.top && d.second ? d.top.score - d.second.score : 0, candidates: near, bodyBytes: 0, latencyMs: performance.now() - t0, sessionId, source: "route" });
    db.close();
    // Gate contract for a harness lives in src/route-abstain.ts.
    return abstainResult({ candidates: near, topScore: abstainConf, topId: d.top?.id ?? null, floor, nearFloor });
  }
  // Session lock applies to confirmed PICKs only. ASK must not consume the
  // lock: if the user picks the second option, the re-route must be free to
  // lock that skill instead.
  const topCard = byId.get(d.top.id)!;
  if (d.outcome === "ASK" && d.second) {
    const secondCard = byId.get(d.second.id);
    const q = secondCard ? buildAskQuestion(topCard, secondCard) : `Confirm use of ${d.top.id}?`;
    const { body } = loadBody(topCard.card, DELIVER_CAP, task);
    if (doLog) log(db, task, "ASK", d.top.id, d.top.score);
    recordOffer({ db, task, outcome: "ASK", skillId: d.top.id, confidence: d.top.score, margin: d.top.score - (d.second?.score ?? 0), candidates: ranking.slice(0, 3).map((r) => ({ id: r.id, score: r.score })), bodyBytes: Buffer.byteLength(body, "utf8"), latencyMs: performance.now() - t0, sessionId, source: "route" });
    db.close();
    // ASK is the contested path, so it is the path that most needs a council.
    // The hint points at the same shortlist the council will open.
    return { outcome: "ASK", skill_id: d.top.id, confidence: d.top.score, margin: d.top.score - (d.second?.score ?? 0), body, scope_fence: scopeFence(topCard.card), verify: topCard.card.verify ?? [], why: d.top.reason, ask_question: q, candidates: ranking.slice(0, 3), locked: false, must_delegate: true, proceed_bare_allowed: false, block_reason: "ASK requires a user pick or council decision — do not proceed bare", council_hint: "two skills are close: call council(task) to let one reader per candidate decide, or ask the user" };
  }
  // Session lock: first confirmed pick in a phase wins; a different pick while
  // locked is still returned but flagged so the harness (not the model) forces a phase switch.
  // locked reports the REAL state: with lock:false no lock was taken, so it
  // must not claim one. A harness reading this field needs the truth.
  let locked = false;
  let lockConflict = false;
  let lockNote = "";
  let lockBlockReason = "";
  if (doLock && d.top) {
    locked = lockSkill(sessionId, d.top.id);
    if (!locked) {
      lockConflict = true;
      const holder = getSession(sessionId).active_skill;
      lockNote = ` | session locked to ${holder} — call phase_done first`;
      lockBlockReason = `session locked to ${holder} — call phase_done first`;
    }
  }
  const { body } = loadBody(topCard.card, DELIVER_CAP, task);
  // pairs_with / ponytail_mode: at most one extra core, delivered as a
  // distilled guard (never a second body), only when 2 skills fit the task cap.
  let fullBody = body;
  let paired: string | null = null;
  const partner = pickPair(topCard.card, kept, profile, (cfg.max_skills_per_task as number) ?? 1);
  if (partner) {
    fullBody += pairGuard(partner);
    paired = partner.id;
  }
  if (doLog) log(db, task, "PICK", d.top.id, d.top.score);
  recordOffer({ db, task, outcome: "PICK", skillId: d.top.id, confidence: d.top.score, margin: d.second ? d.top.score - d.second.score : 99, candidates: ranking.slice(0, 3).map((r) => ({ id: r.id, score: r.score })), bodyBytes: Buffer.byteLength(fullBody, "utf8"), latencyMs: performance.now() - t0, sessionId, source: "route" });
  db.close();
  // must_delegate is true only when the session is locked to another skill.
  // With locking switched off there is no conflict, so the flag must stay
  // false: an agent must not be told to wait for a phase that will never end.
  return { outcome: "PICK", skill_id: d.top.id, confidence: d.top.score, margin: d.second ? d.top.score - d.second.score : 99, body: fullBody, scope_fence: scopeFence(topCard.card), verify: topCard.card.verify ?? [], why: d.top.reason + (paired ? ` | paired ${paired}` : "") + lockNote, candidates: ranking.slice(0, 3), locked, paired, must_delegate: lockConflict, proceed_bare_allowed: false, block_reason: lockBlockReason };
}

function log(db: ReturnType<typeof openDb>, task: string, outcome: string, skill: string | null, conf: number): void {
  try {
    const h = createHash("sha256").update(task).digest("hex").slice(0, 16);
    db.prepare(`INSERT INTO route_logs (ts, task_hash, outcome, skill_id, confidence) VALUES (?, ?, ?, ?, ?)`).run(Date.now(), h, outcome, skill, conf);
  } catch { /* ignore */ }
}

// At most one pair, from the gate-kept pool only (blocked/tier-C never pair).
// Order: explicit card pairs_with first; ponytail_mode full/ultra auto-pairs any
// coding pick with the ponytail core as a guard. The ponytail card never pairs itself.
export function pickPair(topCard: Card, kept: Card[], profile: RepoProfile | null, maxSkills: number): Card | null {
  if (maxSkills < 2) return null;
  let id: string | null = null;
  const p = topCard.pairs_with;
  if (typeof p === "string" && p) id = p;
  else if (Array.isArray(p) && p.length) id = p[0] ?? null;
  const pm = profile?.ponytail_mode;
  if (!id && (pm === "full" || pm === "ultra") && !topCard.id.startsWith("ponytail__")) {
    const coding = topCard.task_types.some((t) => t === "implement" || t === "refactor" || t === "debug");
    if (coding) id = "ponytail__ponytail";
  }
  if (!id || id === topCard.id) return null;
  return kept.find((c) => c.id === id) ?? null;
}

export function formatResult(r: RouteResult): string {
  const lines = [
    `OUTCOME: ${r.outcome}`,
    `SKILL: ${r.skill_id ?? "NONE"}`,
    `CONFIDENCE: ${r.confidence} MARGIN: ${r.margin}`,
    `WHY: ${r.why}`,
    `LOCKED: ${r.locked}`,
    `SCOPE: ${r.scope_fence}`,
  ];
  if (r.paired) lines.push(`PAIRED: ${r.paired}`);
  if (r.must_delegate !== undefined) lines.push(`MUST_DELEGATE: ${r.must_delegate} PROCEED_BARE_ALLOWED: ${r.proceed_bare_allowed ?? false}`);
  if (r.block_reason) lines.push(`BLOCK: ${r.block_reason}`);
  if (r.ask_question) lines.push(`ASK: ${r.ask_question}`);
  if (r.council_hint) lines.push(`COUNCIL: ${r.council_hint}`);
  if (r.body) lines.push(`--- body ---\n${r.body.slice(0, 4000)}`);
  return lines.join("\n");
}
