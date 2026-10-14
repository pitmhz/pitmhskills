import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { openDb, initDb } from "./db.ts";
import { embed } from "./retrieve.ts";
import { validateCard, type Card } from "./types.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CARDS_DIR = join(ROOT, "cards");

// Build pitmhskills.db from cards/*.json. Derived artifact, rebuildable.
export function buildIndex(): { cards: number; errors: string[] } {
  const db = openDb();
  initDb(db);
  const errors: string[] = [];
  let n = 0;
  db.exec("DELETE FROM cards; DELETE FROM cards_fts; DELETE FROM vecs;");
  const files = existsSync(CARDS_DIR) ? readdirSync(CARDS_DIR).filter((f) => f.endsWith(".json")) : [];
  const ins = db.prepare(`INSERT OR REPLACE INTO cards (id, provider, tier, origin, license, hash, purpose, domain, task_types, use_when_text, do_not_use_when_text, scope, disambiguator, cluster, cluster_role, pick_over_primary_when, pairs_with, requires_text, conflicts_text, core_bytes, sections_text, verify_text, skill_path, body_cache) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insFts = db.prepare(`INSERT INTO cards_fts (id, purpose, use_when_text, domain, task_types) VALUES (?, ?, ?, ?, ?)`);
  const insVec = db.prepare(`INSERT OR REPLACE INTO vecs (id, embedding, dim) VALUES (?, ?, ?)`);
  for (const f of files) {
    try {
      const raw = readFileSync(join(CARDS_DIR, f), "utf8");
      const c = JSON.parse(raw) as Card;
      const errs = validateCard(c);
      if (errs.length) { errors.push(`${f}: ${errs.join("; ")}`); continue; }
      const provider = c.id.split("__")[0] ?? "unknown";
      const useW = JSON.stringify(c.use_when);
      ins.run(c.id, provider, c.tier, JSON.stringify(c.origin ?? []), c.license ?? "UNKNOWN", c.hash ?? "", c.purpose, c.domain, JSON.stringify(c.task_types), useW, JSON.stringify(c.do_not_use_when), c.scope, c.disambiguator ?? "", c.cluster ?? "", c.cluster_role ?? "primary", c.pick_over_primary_when ?? null, c.pairs_with ?? null, JSON.stringify(c.requires ?? {}), JSON.stringify(c.conflicts_with ?? []), c.core_bytes ?? 0, JSON.stringify(c.sections ?? []), JSON.stringify(c.verify ?? []), c.skill_path ?? "", "");
      insFts.run(c.id, c.purpose, c.use_when.join(" "), c.domain, c.task_types.join(" "));
      const text = [c.purpose, c.domain, c.task_types.join(" "), c.use_when.join(" ")].join("\n");
      insVec.run(c.id, JSON.stringify(embed(text)), 512);
      n++;
    } catch (e) {
      errors.push(`${f}: ${(e as Error).message}`);
    }
  }
  db.close();
  return { cards: n, errors };
}

export function shaFile(p: string): string {
  try {
    const b = readFileSync(p);
    return createHash("sha256").update(b).digest("hex");
  } catch { return ""; }
}

export function checkCards(): { ok: number; bad: { file: string; errs: string[] }[] } {
  const out = { ok: 0, bad: [] as { file: string; errs: string[] }[] };
  if (!existsSync(CARDS_DIR)) return out;
  for (const f of readdirSync(CARDS_DIR).filter((x) => x.endsWith(".json"))) {
    try {
      const c = JSON.parse(readFileSync(join(CARDS_DIR, f), "utf8"));
      const errs = validateCard(c);
      // stale check: hash vs raw file
      if (c.skill_path && existsSync(c.skill_path)) {
        const h = shaFile(c.skill_path);
        if (h && c.hash && h !== c.hash) errs.push("stale: sha mismatch, needs re-review");
      }
      if (errs.length) out.bad.push({ file: f, errs });
      else out.ok++;
    } catch (e) {
      out.bad.push({ file: f, errs: [(e as Error).message] });
    }
  }
  return out;
}

export function largestSourceFile(): { file: string; lines: number }[] {
  const src = join(ROOT, "src");
  const out: { file: string; lines: number }[] = [];
  for (const f of readdirSync(src).filter((x) => x.endsWith(".ts"))) {
    const p = join(src, f);
    const lines = readFileSync(p, "utf8").split("\n").length;
    out.push({ file: f, lines });
  }
  return out.sort((a, b) => b.lines - a.lines);
}

void statSync;
