import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openDb } from "./db.ts";

// The temporary memory.
//
// A deliberation lives in two places: a sqlite row (the record, the verdict
// index, the composed result) and a file drop under .state/council/ (the
// verdict itself). The file drop is what makes this a real second brain: a
// subagent running in another process writes its verdict to a file, and the
// composer reads files. No shared writer, no lock contention, and the memory
// expires on its own.
//
// Everything here expires. A deliberation that is not closed goes cold after
// TTL_MINUTES and the next council starts clean. Stale verdicts from an
// unrelated task must never leak into a decision.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const STATE = join(ROOT, ".state", "council");

/** How long a deliberation stays warm. After this it is pruned. */
export const TTL_MINUTES = 30;
const TTL_MS = TTL_MINUTES * 60 * 1000;

export type Verdict = "keep" | "drop" | "merge";

export interface CouncilNote {
  skill_id: string;
  verdict: Verdict;
  evidence: string;
  score: number;
  role: "specialist" | "critic";
  bytes: number;
}

/** Persisted form in deliberations.candidates: {id, score, reason}. */
export interface PersistedCandidate {
  id: string;
  score: number;
  reason: string;
}

/**
 * Parse the candidates column. New rows store objects; older rows stored
 * a plain id array (strings). Strings read back with score 0 so old
 * deliberations still compose.
 */
export function parsePersistedCandidates(raw: string | null | undefined): PersistedCandidate[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: PersistedCandidate[] = [];
  for (const item of parsed) {
    if (typeof item === "string") {
      if (item) out.push({ id: item, score: 0, reason: "" });
    } else if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      const id = typeof o["id"] === "string" ? String(o["id"]) : "";
      if (!id) continue;
      const score = typeof o["score"] === "number" && Number.isFinite(o["score"]) ? Number(o["score"]) : 0;
      const reason = typeof o["reason"] === "string" ? String(o["reason"]) : "";
      out.push({ id, score, reason });
    }
  }
  return out;
}

export function dirFor(id: string): string {
  return join(STATE, id);
}

function notePath(id: string, skillId: string): string {
  return join(dirFor(id), `${skillId.replace(/[^a-zA-Z0-9_-]/g, "")}.json`);
}

export function initCouncilSchema(db: ReturnType<typeof openDb>): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS deliberations (
      id TEXT PRIMARY KEY,
      task TEXT NOT NULL,
      session_id TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open',
      chosen_id TEXT,
      chosen_reason TEXT,
      confidence REAL DEFAULT 0,
      brief TEXT DEFAULT '',
      dissent TEXT DEFAULT '',
      candidates TEXT DEFAULT '[]',
      created_at INTEGER,
      updated_at INTEGER,
      expires_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS deliberation_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deliberation_id TEXT NOT NULL,
      skill_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'specialist',
      verdict TEXT NOT NULL,
      evidence TEXT DEFAULT '',
      score REAL DEFAULT 0,
      bytes INTEGER DEFAULT 0,
      created_at INTEGER
    );
  `);
  // CREATE TABLE IF NOT EXISTS never adds a column to an existing table, so
  // the schema is migrated by hand. A table from an earlier build must keep
  // working, not crash the router.
  try {
    const cols = db.query<{ name: string }, []>(`PRAGMA table_info(deliberations)`).all();
    if (cols.length && !cols.some((c) => c.name === "candidates")) {
      db.exec(`ALTER TABLE deliberations ADD COLUMN candidates TEXT DEFAULT '[]'`);
    }
  } catch { /* leave the table as it is */ }
}

/** Delete one deliberation row, its notes, and its note files. */
export function pruneDeliberation(db: ReturnType<typeof openDb>, id: string): void {
  try { db.query(`DELETE FROM deliberation_notes WHERE deliberation_id = ?`).run(id); } catch { /* ignore */ }
  try { db.query(`DELETE FROM deliberations WHERE id = ?`).run(id); } catch { /* ignore */ }
  try {
    const d = dirFor(id);
    if (existsSync(d)) for (const f of readdirSync(d)) unlinkSync(join(d, f));
  } catch { /* ignore */ }
}

/** Delete deliberations past their TTL, and their note files. */
export function pruneExpired(db: ReturnType<typeof openDb>, now = Date.now()): number {
  initCouncilSchema(db);
  let stale: { id: string }[] = [];
  try {
    stale = db.query<{ id: string }, number>(`SELECT id FROM deliberations WHERE expires_at < ?`).all(now);
  } catch { stale = []; }
  for (const s of stale) pruneDeliberation(db, s.id);
  return stale.length;
}

export function writeNoteFile(id: string, note: CouncilNote): void {
  mkdirSync(dirFor(id), { recursive: true });
  writeFileSync(notePath(id, note.skill_id), JSON.stringify(note, null, 2) + "\n");
}

/** Remove one note file. Used when the sqlite half of a write fails. */
export function deleteNoteFile(id: string, skillId: string): void {
  try {
    const p = notePath(id, skillId);
    if (existsSync(p)) unlinkSync(p);
  } catch { /* ignore */ }
}

function readNoteFiles(id: string): CouncilNote[] {
  const d = dirFor(id);
  if (!existsSync(d)) return [];
  const out: CouncilNote[] = [];
  for (const f of readdirSync(d)) {
    if (!f.endsWith(".json")) continue;
    try {
      const raw = JSON.parse(readFileSync(join(d, f), "utf8")) as CouncilNote;
      if (raw && raw.skill_id) out.push(raw);
    } catch { /* ignore a half-written note */ }
  }
  return out;
}

export function readNotes(db: ReturnType<typeof openDb>, id: string): CouncilNote[] {
  const byId = new Map<string, CouncilNote>();
  try {
    const rows = db.query<{ skill_id: string; role: string; verdict: string; evidence: string; score: number; bytes: number }, string>(
      `SELECT skill_id, role, verdict, evidence, score, bytes FROM deliberation_notes WHERE deliberation_id = ?`
    ).all(id);
    for (const r of rows) {
      byId.set(r.skill_id, {
        skill_id: r.skill_id, verdict: r.verdict as Verdict, evidence: r.evidence ?? "",
        score: r.score, role: (r.role as "specialist" | "critic") ?? "specialist", bytes: r.bytes ?? 0,
      });
    }
  } catch { /* no notes yet */ }
  // The file drop wins: a subagent may have written a note that has not been
  // flushed to sqlite yet, and a later write must override an earlier one.
  for (const n of readNoteFiles(id)) byId.set(n.skill_id, n);
  return [...byId.values()];
}

export function touchDeliberation(db: ReturnType<typeof openDb>, id: string): void {
  const now = Date.now();
  db.query(`UPDATE deliberations SET updated_at = ?, expires_at = ? WHERE id = ?`).run(now, now + TTL_MS, id);
}

export function ttlMs(): number {
  return TTL_MS;
}
