import { openDb, loadConfig } from "./db.ts";
import { loadAllCards } from "./retrieve.ts";
import { loadBody, pairGuard, DELIVER_CAP } from "./deliver.ts";
import { initCouncilSchema, pruneExpired, readNotes, touchDeliberation, ttlMs, parsePersistedCandidates } from "./council-store.ts";
import { councilShortlist } from "./council.ts";
import type { CouncilOptions, ShortlistEntry } from "./council-types.ts";
import type { Card } from "./types.ts";
import type { CouncilNote, PersistedCandidate } from "./council-store.ts";

// Compose: merge the verdicts into ONE direction.
//
// Rules, in order:
//  1. A candidate with no note is DROPPED. Silence is not consent. This is
//     what stops the agent from carrying three skill bodies it never used.
//  2. Only "keep" and "merge" survive. "merge" is a complement: it may
//     contribute sections but never becomes the main skill.
//  3. At most max_skills_per_task skills survive, highest score first.
//  4. Two survivors that conflict with each other: the higher score wins.
//  5. The brief is the chosen skill's body, plus the surviving sections of
//     a complement. One brief, one direction.

export interface ComposeResult {
  ok: boolean;
  deliberation_id: string;
  skill_id: string | null;
  confidence: number;
  /** the single merged brief the agent should follow */
  brief: string;
  /** what was dropped and why, one line each */
  dissent: string[];
  /** true when the council did not have enough notes to decide */
  incomplete: boolean;
  message: string;
}

/** Dissent lines kept in the composed decision. */
const DISSENT_CAP = 6;

function conflictSet(card: Card, all: Map<string, Card>): Set<string> {
  const out = new Set<string>();
  for (const c of card.conflicts_with ?? []) out.add(c);
  for (const [id, c] of all) if ((c.conflicts_with ?? []).includes(card.id)) out.add(id);
  return out;
}

export function composeCouncil(id: string, cwd = process.cwd()): ComposeResult {
  const db = openDb();
  let task = "";
  let cards: Card[] = [];
  let notes: CouncilNote[] = [];
  let candidateIds: string[] = [];
  let persisted: PersistedCandidate[] = [];
  try {
    initCouncilSchema(db);
    try { pruneExpired(db); } catch { /* ignore */ }
    const row = db.query<{ task: string; candidates: string }, string>(`SELECT task, candidates FROM deliberations WHERE id = ?`).get(id);
    if (!row) {
      return { ok: false, deliberation_id: id, skill_id: null, confidence: 0, brief: "", dissent: [], incomplete: true, message: `unknown deliberation ${id}` };
    }
    task = row.task;
    persisted = parsePersistedCandidates(row.candidates);
    candidateIds = persisted.map((p) => p.id);
    cards = loadAllCards(db);
    notes = readNotes(db, id);
  } finally {
    try { db.close(); } catch { /* ignore */ }
  }

  const byId = new Map(cards.map((c) => [c.id, c]));
  const cfg = loadConfig();
  const maxSkills = (cfg.max_skills_per_task as number) ?? 2;

  const noteById = new Map(notes.map((n) => [n.skill_id, n]));
  const dissent: string[] = [];

  // 1 + 2: only endorsed candidates survive.
  const endorsed = notes.filter((n) => n.verdict === "keep" || n.verdict === "merge");
  const endorsedIds = new Set(endorsed.map((n) => n.skill_id));

  // Ordering comes from the persisted scores written at open. Compose never
  // re-scores the known candidates: changing config after open cannot move them.
  const scoreOf = new Map(persisted.map((p) => [p.id, p.score]));
  // Only notes for skills outside the persisted list need a lookup, and that
  // lookup fills just the missing entries - it never overwrites open scores.
  const missing = notes.filter((n) => n.skill_id !== "__critic__" && !scoreOf.has(n.skill_id));
  if (missing.length > 0) {
    const entries = councilShortlist(task, cwd, {} as CouncilOptions);
    for (const e of entries) {
      if (!scoreOf.has(e.card.id)) scoreOf.set(e.card.id, e.score);
    }
  }
  for (const n of notes) if (!scoreOf.has(n.skill_id)) scoreOf.set(n.skill_id, 0);

  // Everything the council saw but did not endorse is recorded, one line.
  // The council only ever saw its own shortlist, so this is a short list.
  const allSeen = new Set([...candidateIds, ...endorsedIds]);
  for (const sid of allSeen) {
    if (endorsedIds.has(sid)) continue;
    const n = noteById.get(sid);
    const why = n?.evidence?.trim() || "no verdict recorded";
    dissent.push(`dropped ${sid}: ${why}`);
  }
  // Dissent is bounded. The point is to record what was rejected and why,
  // not to replay the whole shortlist.
  const capDissent = (list: string[]): string[] => {
    const kept = list.slice(0, DISSENT_CAP);
    const rest = list.length - kept.length;
    if (rest > 0) kept.push(`... and ${rest} more dropped`);
    return kept;
  };

  if (endorsed.length === 0) {
    const msg = notes.length === 0
      ? "no verdicts recorded: spawn the council subagents first"
      : "every candidate was rejected: no skill applies";
    return { ok: false, deliberation_id: id, skill_id: null, confidence: 0, brief: "", dissent: capDissent(dissent), incomplete: true, message: msg };
  }

  // 3: cap the survivors.
  const sorted = [...endorsed].sort((a, b) => (scoreOf.get(b.skill_id) ?? 0) - (scoreOf.get(a.skill_id) ?? 0));
  const survivors: CouncilNote[] = [];
  for (const n of sorted) {
    if (survivors.length >= maxSkills) {
      dissent.push(`dropped ${n.skill_id}: over the ${maxSkills}-skill cap`);
      continue;
    }
    // 4: conflicts. A survivor that conflicts with one already kept loses.
    const card = byId.get(n.skill_id);
    const clash = card ? survivors.find((s) => conflictSet(card, byId).has(s.skill_id)) : undefined;
    if (clash) {
      dissent.push(`dropped ${n.skill_id}: conflicts with ${clash.skill_id}`);
      continue;
    }
    survivors.push(n);
  }
  if (!survivors.length) {
    return { ok: false, deliberation_id: id, skill_id: null, confidence: 0, brief: "", dissent: capDissent(dissent), incomplete: true, message: "all endorsed candidates conflicted" };
  }

  // 5: one brief, one direction.
  const main = survivors.find((n) => n.verdict === "keep") ?? survivors[0]!;
  const mainCard = byId.get(main.skill_id);
  if (!mainCard) {
    return { ok: false, deliberation_id: id, skill_id: null, confidence: 0, brief: "", dissent: capDissent(dissent), incomplete: true, message: `card for ${main.skill_id} is missing` };
  }
  const { body } = loadBody(mainCard, DELIVER_CAP, task);
  const parts = [body];
  for (const s of survivors) {
    if (s.skill_id === main.skill_id) continue;
    const c = byId.get(s.skill_id);
    if (!c) continue;
    const extra = pairGuard(c);
    parts.push(`\nCOMPLEMENT (${s.skill_id}): ${s.evidence || "complementary guidance"}`, extra);
  }
  const brief = parts.join("\n");

  const confidence = Math.max(0, Math.min(100, scoreOf.get(main.skill_id) ?? 0));
  // Incomplete when some candidates never got a verdict (a batch never noted
  // shows up the same way: those candidates have no note).
  const notedCandidates = new Set(notes.map((n) => n.skill_id).filter((sid) => candidateIds.includes(sid)));
  const isIncomplete = notes.length < candidateIds.length || notedCandidates.size < candidateIds.length;
  const d2 = openDb();
  try {
    initCouncilSchema(d2);
    d2.query(
      `UPDATE deliberations SET status='decided', chosen_id=?, chosen_reason=?, confidence=?, brief=?, dissent=?, updated_at=?, expires_at=? WHERE id=?`
    ).run(main.skill_id, main.evidence, confidence, brief, capDissent(dissent).join("\n"), Date.now(), Date.now() + ttlMs(), id);
  } finally {
    try { d2.close(); } catch { /* ignore */ }
  }

  const baseMsg = `decided ${main.skill_id} (${survivors.length} survivor${survivors.length === 1 ? "" : "s"}, ${dissent.length} dropped)`;
  const message = isIncomplete
    ? `incomplete: ${notedCandidates.size} of ${candidateIds.length} have verdicts; ${baseMsg}`
    : baseMsg;

  return {
    ok: true,
    deliberation_id: id,
    skill_id: main.skill_id,
    confidence,
    brief,
    dissent: capDissent(dissent),
    incomplete: isIncomplete,
    message,
  };
}

export type { ShortlistEntry };
