import { Database } from "bun:sqlite";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Card } from "./types.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export function loadConfig(): Record<string, number & string> & { db_path: string; floor: number; margin: number; pick_floor: number; top_k_retrieve: number; max_bytes: number } {
  const raw = readFileSync(join(ROOT, "config.json"), "utf8");
  return JSON.parse(raw);
}

export function dbPath(): string {
  const cfg = loadConfig();
  const p = cfg.db_path as string;
  return p.includes(":") || p.startsWith("/") ? p : join(ROOT, p);
}

export function openDb(path?: string): Database {
  const db = new Database(path ?? dbPath(), { create: true });
  db.exec("PRAGMA journal_mode=WAL;");
  return db;
}

// Standalone schema: cards + FTS5 BM25 + JSON embeddings (no native vec extension).
// vecs.embedding is a JSON array string; cosine computed in JS so Windows needs zero native deps.
// Upgrade path: swap vecs to sqlite-vec when >2000 skills makes brute force slow.
export function initDb(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS cards (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      tier TEXT NOT NULL DEFAULT 'B',
      origin TEXT NOT NULL DEFAULT '[]',
      license TEXT NOT NULL DEFAULT 'UNKNOWN',
      hash TEXT NOT NULL DEFAULT '',
      purpose TEXT NOT NULL DEFAULT '',
      domain TEXT NOT NULL DEFAULT '',
      task_types TEXT NOT NULL DEFAULT '[]',
      use_when_text TEXT NOT NULL DEFAULT '',
      do_not_use_when_text TEXT NOT NULL DEFAULT '',
      scope TEXT NOT NULL DEFAULT '',
      disambiguator TEXT DEFAULT '',
      cluster TEXT DEFAULT '',
      cluster_role TEXT DEFAULT 'primary',
      pick_over_primary_when TEXT DEFAULT NULL,
      pairs_with TEXT DEFAULT NULL,
      requires_text TEXT NOT NULL DEFAULT '{}',
      conflicts_text TEXT NOT NULL DEFAULT '[]',
      core_bytes INTEGER NOT NULL DEFAULT 0,
      sections_text TEXT NOT NULL DEFAULT '[]',
      verify_text TEXT NOT NULL DEFAULT '[]',
      skill_path TEXT DEFAULT '',
      body_cache TEXT DEFAULT ''
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS cards_fts USING fts5(
      id, purpose, use_when_text, domain, task_types, tokenize='porter'
    );
    CREATE TABLE IF NOT EXISTS vecs (
      id TEXT PRIMARY KEY,
      embedding TEXT NOT NULL DEFAULT '[]',
      dim INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS route_logs (
      ts INTEGER, task_hash TEXT, outcome TEXT, skill_id TEXT, confidence REAL
    );
    CREATE TABLE IF NOT EXISTS eval_runs (
      ts INTEGER, top1 REAL, wrong_rate REAL, abst_prec REAL, notes TEXT
    );
  `);
}

export function cardFromRow(r: Record<string, unknown>): Card {
  const j = (s: unknown, fb: string) => String(s ?? fb);
  return {
    id: String(r["id"]),
    tier: (String(r["tier"]) as Card["tier"]) || "B",
    origin: JSON.parse(j(r["origin"], "[]")),
    license: String(r["license"] ?? "UNKNOWN"),
    hash: String(r["hash"] ?? ""),
    purpose: String(r["purpose"] ?? ""),
    domain: String(r["domain"] ?? ""),
    task_types: JSON.parse(j(r["task_types"], "[]")),
    use_when: JSON.parse(j(r["use_when_text"], "[]")),
    do_not_use_when: JSON.parse(j(r["do_not_use_when_text"], "[]")),
    scope: String(r["scope"] ?? ""),
    disambiguator: String(r["disambiguator"] ?? ""),
    cluster: String(r["cluster"] ?? ""),
    cluster_role: (String(r["cluster_role"] || "primary") as Card["cluster_role"]),
    pick_over_primary_when: (r["pick_over_primary_when"] as string) ?? null,
    pairs_with: (r["pairs_with"] as string) ?? null,
    requires: JSON.parse(j(r["requires_text"], "{}")),
    conflicts_with: JSON.parse(j(r["conflicts_text"], "[]")),
    core_bytes: Number(r["core_bytes"] ?? 0),
    sections: JSON.parse(j(r["sections_text"], "[]")),
    verify: JSON.parse(j(r["verify_text"], "[]")),
    skill_path: String(r["skill_path"] ?? ""),
  };
}

export function dbExists(path?: string): boolean {
  return existsSync(path ?? dbPath());
}
