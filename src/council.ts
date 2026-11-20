// Skill council: temp-memory second brain for choosing between close candidates.
// 1. openCouncil() -> shortlist + spawn plan (one brief per candidate).
// 2. recordNote() -> subagent verdict (keep/drop/merge) + quoted evidence.
// 3. composeCouncil() -> one skill, one brief, bounded dissent.
// Memory lives in council-store.ts; briefs in council-briefs.ts.

import { createHash } from "node:crypto";
import { openDb, initDb, loadConfig } from "./db.ts";
import { detectSignals } from "./signals.ts";
import { hardFilter } from "./gate.ts";
import { retrieveWith, loadAllCards } from "./retrieve.ts";
import { getLexicon } from "./lexicon-stats.ts";
import { shortlist } from "./collapse.ts";
import { scoreCandidates } from "./decide.ts";
import { DEFAULT_WEIGHTS } from "./weights.ts";
import type { Weights } from "./weights.ts";
import { loadBody, DELIVER_CAP } from "./deliver.ts";
import { loadProfile } from "./profile.ts";
import type { Card } from "./types.ts";
import {
  initCouncilSchema, pruneExpired, readNotes, writeNoteFile, deleteNoteFile, touchDeliberation, ttlMs,
  TTL_MINUTES, type CouncilNote, type Verdict,
} from "./council-store.ts";
import { specialistPrompt, criticPrompt } from "./council-briefs.ts";
import type { Council, CouncilCandidate, CouncilOptions, PlanItem, ShortlistEntry } from "./council-types.ts";
export type { Council, CouncilCandidate, CouncilOptions, ShortlistEntry };

export { TTL_MINUTES, type CouncilNote, type Verdict };
export type { ComposeResult } from "./council-compose.ts";

export function councilId(task: string, sessionId: string): string {
  return createHash("sha256").update(`${sessionId}::${task}`).digest("hex").slice(0, 16);
}

/**
 * Deterministic shortlist: same pipeline as route(), stops before the
 * single-pick decision to hand close candidates to readers.
 */
export function councilShortlist(task: string, cwd: string, opts: CouncilOptions = {}): ShortlistEntry[] {
  const cfg = loadConfig();
  const weights: Weights = { ...DEFAULT_WEIGHTS, ...(opts.weights ?? {}), ...((cfg.weights as unknown as Partial<Weights>) ?? {}) };
  const db = openDb();
  try {
    initDb(db);
    const sig = detectSignals(cwd);
    let profile = null;
    try { profile = loadProfile(cwd); } catch { profile = null; }
    const boosts = new Map<string, number>();
    if (profile) for (const p of profile.preferred ?? []) boosts.set(p.id, p.boost ?? 0.1);
    const all = loadAllCards(db);
    const { kept } = hardFilter(all, task, sig, profile);
    const pool = kept.filter((c) => c.tier === "A" || c.tier === "B");
    const lex = getLexicon(all.filter((c) => c.tier === "A" || c.tier === "B"));
    const depth = (cfg.score_pool as number) ?? 40;
    const ranked = retrieveWith(db, task, pool, { topK: depth, boosts, lex, queryTerms: (cfg.query_terms as number) ?? 12 });
    const sl = shortlist(ranked, { maxPerCluster: (cfg.max_per_cluster as number) ?? 3, maxTotal: depth, task, lex });
    const scored = scoreCandidates(sl.kept, task, lex, weights);
    const byId = new Map(sl.kept.map((r) => [r.card.id, r.card]));
    return scored
      .filter((s) => s.score >= Math.max(20, (cfg.floor as number) * 0.5))
      .map((s) => {
        const card = byId.get(s.id)!;
        return { card, score: s.score, reason: s.reason, matched: s.matched };
      });
  } finally {
    try { db.close(); } catch { /* ignore */ }
  }
}

export function openCouncil(task: string, cwd: string, opts: CouncilOptions = {}): Council {
  const sessionId = opts.sessionId ?? "default";
  const id = councilId(task, sessionId);
  const cfg = loadConfig();
  const size = opts.size ?? (cfg.council_size as number) ?? 4;
  const briefBytes = Math.min(opts.briefBytes ?? DELIVER_CAP, DELIVER_CAP);

  const entries = councilShortlist(task, cwd, opts);
  const top = entries.slice(0, size);

  const db = openDb();
  try {
    initCouncilSchema(db);
    pruneExpired(db);
    const now = Date.now();
    const existing = db.query<{ id: string }, string>(`SELECT id FROM deliberations WHERE id = ?`).get(id);
    // Persist scores at open so compose never needs to re-score.
    const persisted = top.map((e) => ({ id: e.card.id, score: e.score, reason: e.reason }));
    const persistedJson = JSON.stringify(persisted);
    if (!existing) {
      db.query(
        `INSERT OR REPLACE INTO deliberations (id, task, session_id, status, candidates, created_at, updated_at, expires_at) VALUES (?, ?, ?, 'open', ?, ?, ?, ?)`
      ).run(id, task, sessionId, persistedJson, now, now, now + ttlMs());
    } else {
      db.query(`UPDATE deliberations SET updated_at = ?, expires_at = ?, candidates = ? WHERE id = ?`).run(now, now + ttlMs(), persistedJson, id);
    }
  } finally {
    try { db.close(); } catch { /* ignore */ }
  }

  const candidates: CouncilCandidate[] = top.map((e) => {
    const { body } = loadBody(e.card, briefBytes, task);
    return {
      id: e.card.id,
      score: e.score,
      purpose: e.card.purpose,
      disambiguator: e.card.disambiguator ?? "",
      reason: e.reason,
      brief: body,
    };
  });

  // Critic first, then specialists by score desc; chunk to batches of 3.
  const orderedTop = [...top].sort((a, b) => b.score - a.score);
  const plan: PlanItem[] = [];
  if (candidates.length > 1) {
    plan.push({ skill_id: "__critic__", role: "critic", prompt: criticPrompt(task, id, orderedTop) });
  }
  for (const entry of orderedTop) {
    const c = candidates.find((cand) => cand.id === entry.card.id)!;
    plan.push({ skill_id: c.id, role: "specialist", prompt: specialistPrompt(task, id, entry, c.brief) });
  }
  // plan = full list; plan_batches = same list chunked at 3. Process batches in order.
  const plan_batches: PlanItem[][] = [];
  for (let i = 0; i < plan.length; i += 3) plan_batches.push(plan.slice(i, i + 3));

  return {
    id,
    task,
    status: "open",
    candidates,
    notes: readNotesSafe(id),
    plan,
    plan_batches,
    expires_at: Date.now() + ttlMs(),
  };
}

function readNotesSafe(id: string): CouncilNote[] {
  const db = openDb();
  try {
    initCouncilSchema(db);
    return readNotes(db, id);
  } finally {
    try { db.close(); } catch { /* ignore */ }
  }
}

export function recordNote(
  id: string,
  skillId: string,
  verdict: Verdict,
  evidence: string,
  role: "specialist" | "critic" = "specialist",
  score = 0
): { ok: boolean; message: string; notes: number; evidence_quality: { quoted: boolean } } {
  const rawEvidence = evidence ?? "";
  // Quoted verbatim evidence is the quality signal; unquoted stays accepted.
  const quoted = /"[^"\n]{2,}"/.test(rawEvidence);
  const note: CouncilNote = {
    skill_id: skillId,
    verdict,
    evidence: rawEvidence.slice(0, 400),
    score,
    role,
    bytes: rawEvidence.length,
  };
  // File first, then sqlite; on sqlite failure remove the file.
  writeNoteFile(id, note);
  const db = openDb();
  try {
    initCouncilSchema(db);
    const row = db.query<{ id: string }, string>(`SELECT id FROM deliberations WHERE id = ?`).get(id);
    if (!row) {
      deleteNoteFile(id, skillId);
      return { ok: false, message: `unknown deliberation ${id}`, notes: 0, evidence_quality: { quoted } };
    }
    try {
      db.query(`DELETE FROM deliberation_notes WHERE deliberation_id = ? AND skill_id = ?`).run(id, skillId);
      db.query(
        `INSERT INTO deliberation_notes (deliberation_id, skill_id, role, verdict, evidence, score, bytes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(id, skillId, role, verdict, note.evidence, score, note.bytes, Date.now());
      touchDeliberation(db, id);
    } catch {
      deleteNoteFile(id, skillId);
      return { ok: false, message: `sqlite write failed for ${skillId}`, notes: 0, evidence_quality: { quoted } };
    }
    const notes = readNotes(db, id);
    return { ok: true, message: `verdict recorded: ${skillId} ${verdict}`, notes: notes.length, evidence_quality: { quoted } };
  } catch {
    deleteNoteFile(id, skillId);
    return { ok: false, message: `note write failed for ${skillId}`, notes: 0, evidence_quality: { quoted } };
  } finally {
    try { db.close(); } catch { /* ignore */ }
  }
}

