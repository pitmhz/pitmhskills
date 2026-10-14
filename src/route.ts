import { createHash } from "node:crypto";
import { openDb, initDb, loadConfig } from "./db.ts";
import { detectSignals } from "./signals.ts";
import { hardFilter } from "./gate.ts";
import { retrieve, loadAllCards } from "./retrieve.ts";
import { collapse } from "./collapse.ts";
import { scoreCandidates, decide, buildAskQuestion } from "./decide.ts";
import { loadBody, scopeFence, pairGuard } from "./deliver.ts";
import { loadProfile } from "./profile.ts";
import type { RepoProfile } from "./profile.ts";
import { lockSkill, getSession } from "./session.ts";
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
  o: { sessionId?: string; lock?: boolean; floor?: number; margin?: number; log?: boolean }
): RouteResult {
  const sessionId = o.sessionId ?? "default";
  const doLock = o.lock !== false;
  const doLog = o.log !== false;
  const cfg = loadConfig();
  const floor = o.floor ?? (cfg.floor as number);
  const margin = o.margin ?? (cfg.margin as number);
  const pickFloor = cfg.pick_floor as number;
  const db = openDb();
  initDb(db);
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
  const ranked = retrieve(db, task, pool, cfg.top_k_retrieve as number, boosts);
  const collapsed = collapse(ranked, task);
  const ranking = scoreCandidates(collapsed, task);
  const d = decide(ranking, collapsed, floor, margin, pickFloor);
  const byId = new Map(collapsed.map((r) => [r.card.id, r]));
  if (d.outcome === "ABSTAIN" || !d.top) {
    if (doLog) log(db, task, "ABSTAIN", null, d.top?.score ?? 0);
    db.close();
    return { outcome: "ABSTAIN", skill_id: null, confidence: d.top?.score ?? 0, margin: 0, body: "", scope_fence: "Only touch files the task names.", verify: [], why: d.top ? `top ${d.top.id} score ${d.top.score} < floor` : "no candidates", candidates: ranking.slice(0, 3), locked: false };
  }
  // Session lock applies to confirmed PICKs only. ASK must not consume the
  // lock: if the user picks the second option, the re-route must be free to
  // lock that skill instead.
  const topCard = byId.get(d.top.id)!;
  if (d.outcome === "ASK" && d.second) {
    const secondCard = byId.get(d.second.id);
    const q = secondCard ? buildAskQuestion(topCard, secondCard) : `Confirm use of ${d.top.id}?`;
    if (doLog) log(db, task, "ASK", d.top.id, d.top.score);
    db.close();
    const { body } = loadBody(topCard.card, 3000, task);
    return { outcome: "ASK", skill_id: d.top.id, confidence: d.top.score, margin: d.top.score - (d.second?.score ?? 0), body, scope_fence: scopeFence(topCard.card), verify: topCard.card.verify ?? [], why: d.top.reason, ask_question: q, candidates: ranking.slice(0, 3), locked: false };
  }
  // Session lock: first confirmed pick in a phase wins; a different pick while
  // locked is still returned but flagged so the harness (not the model) forces a phase switch.
  let locked = true;
  let lockNote = "";
  if (doLock && d.top) {
    locked = lockSkill(sessionId, d.top.id);
    if (!locked) {
      const holder = getSession(sessionId).active_skill;
      lockNote = ` | session locked to ${holder} — call phase_done first`;
    }
  }
  const { body } = loadBody(topCard.card, 3000, task);
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
  db.close();
  return { outcome: "PICK", skill_id: d.top.id, confidence: d.top.score, margin: d.second ? d.top.score - d.second.score : 99, body: fullBody, scope_fence: scopeFence(topCard.card), verify: topCard.card.verify ?? [], why: d.top.reason + (paired ? ` | paired ${paired}` : "") + lockNote, candidates: ranking.slice(0, 3), locked, paired };
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
  if (r.ask_question) lines.push(`ASK: ${r.ask_question}`);
  if (r.body) lines.push(`--- body ---\n${r.body.slice(0, 4000)}`);
  return lines.join("\n");
}
