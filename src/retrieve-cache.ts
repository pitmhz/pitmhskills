import { Database } from "bun:sqlite";
import type { Card } from "./types.ts";
import { cardFromRow } from "./db.ts";

// Cache helpers split from retrieve.ts for the 200-line cap.
// Card list and stored vectors change only when the index is rebuilt, but
// routing happens on every user turn. Both are cached and invalidated by a
// cheap row count.
let cardsCache: { key: string; cards: Card[] } | null = null;
let vecsCache: { key: string; vecs: Map<string, number[]> } | null = null;

export function dbKey(db: Database): string {
  try {
    const row = db.query<{ n: number; h: string | null }, []>(`SELECT count(*) n, max(hash) h FROM cards`).get();
    return `${row?.n ?? 0}:${row?.h ?? ""}`;
  } catch {
    return "0:";
  }
}

export function loadAllCards(db: Database): Card[] {
  const key = dbKey(db);
  if (cardsCache && cardsCache.key === key) return cardsCache.cards;
  const rows = db.query<Record<string, unknown>, []>(`SELECT * FROM cards`).all();
  const cards = rows.map(cardFromRow);
  cardsCache = { key, cards };
  vecsCache = null;
  return cards;
}

export function loadVecs(db: Database): Map<string, number[]> {
  const key = dbKey(db);
  if (vecsCache && vecsCache.key === key) return vecsCache.vecs;
  const vecs = new Map<string, number[]>();
  try {
    const rows = db.query<{ id: string; embedding: string }, []>(`SELECT id, embedding FROM vecs`).all();
    for (const r of rows) vecs.set(r.id, JSON.parse(r.embedding) as number[]);
  } catch { /* no vectors */ }
  vecsCache = { key, vecs };
  return vecs;
}
