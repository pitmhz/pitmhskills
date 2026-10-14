import { Database } from "bun:sqlite";
import type { Card, RankedCard } from "./types.ts";
import { cardFromRow } from "./db.ts";

// Hybrid: FTS5 BM25 (lexical, always on) + hashed TF-IDF cosine (vector arm, pure JS).
// No ONNX download needed for v0; real embeddings can fill vecs later with same cosine fn.
export function tokenize(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1);
}

function hashToken(t: string, dim: number): number {
  let h = 2166136261;
  for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h) % dim;
}

export const VEC_DIM = 512;

export function embed(text: string, dim = VEC_DIM): number[] {
  const v = new Array<number>(dim).fill(0);
  const toks = tokenize(text);
  const tf = new Map<number, number>();
  for (const t of toks) tf.set(hashToken(t, dim), (tf.get(hashToken(t, dim)) ?? 0) + 1);
  const n = toks.length || 1;
  for (const [i, c] of tf) v[i] = (c / n) * Math.log(1 + n);
  const norm = Math.sqrt(v.reduce((a, x) => a + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

export function cosine(a: number[], b: number[]): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i]! * b[i]!;
  return s;
}

function cardText(c: Card): string {
  return [c.purpose, c.domain, c.task_types.join(" "), c.use_when.join(" ")].join("\n");
}

function rrf(rank: number, k = 60): number {
  return 1 / (k + rank);
}

export function retrieve(db: Database, task: string, candidates: Card[], topK = 8, boosts?: Map<string, number>): RankedCard[] {
  if (candidates.length === 0) return [];
  const ids = new Set(candidates.map((c) => c.id));
  // BM25 ranks via FTS5 match
  const q = task.replace(/"/g, '""').split(/\s+/).filter(Boolean).map((t) => `"${t}"`).join(" OR ");
  let bmRank = new Map<string, number>();
  try {
    const rows = db.query<{ id: string; rank: number }, string>(
      `SELECT id, rank FROM cards_fts WHERE cards_fts MATCH ? ORDER BY rank LIMIT 50`
    ).all(q);
    rows.forEach((r, i) => { if (ids.has(r.id)) bmRank.set(r.id, i); });
  } catch { /* FTS empty */ }
  // Vector arm: cosine vs stored vecs, fallback to live hash embed
  const qv = embed(task);
  const scored: RankedCard[] = candidates.map((c) => {
    let vec = 0;
    try {
      const row = db.query<{ embedding: string }, string>(`SELECT embedding FROM vecs WHERE id = ?`).get(c.id);
      const sv: number[] = row ? JSON.parse(row.embedding) : embed(cardText(c));
      vec = cosine(qv, sv);
    } catch { vec = cosine(qv, embed(cardText(c))); }
    const br = bmRank.has(c.id) ? bmRank.get(c.id)! : 999;
    const vr = 0; // rank computed below
    void vr;
    return { card: c, bm25: br, vec, fused: 0 };
  });
  const byVec = [...scored].sort((a, b) => b.vec - a.vec);
  const vecRank = new Map(byVec.map((s, i) => [s.card.id, i]));
  for (const s of scored) {
    const br = s.bm25 >= 999 ? 0 : rrf(s.bm25);
    const vr = rrf(vecRank.get(s.card.id) ?? 999);
    s.fused = br + vr + s.vec * 0.1;
  }
  // Tier A searched first: boost A over B
  for (const s of scored) if (s.card.tier === "A") s.fused += 0.05;
  // Repo profile preferred boosts (default 0.1 per entry); absent map = no change.
  if (boosts) for (const s of scored) s.fused += boosts.get(s.card.id) ?? 0;
  return scored.sort((a, b) => b.fused - a.fused).slice(0, topK);
}

export function loadAllCards(db: Database): Card[] {
  const rows = db.query<Record<string, unknown>, []>(`SELECT * FROM cards`).all();
  return rows.map(cardFromRow);
}
