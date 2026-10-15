import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openDb } from "./db.ts";
import { loadAllCards } from "./retrieve.ts";
import { runEval } from "./eval.ts";
import { validateCard, type Card } from "./types.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export interface ComboRow { ts: number; task_hash: string; outcome: string; skill_id: string | null; confidence: number }
export interface ComboPair { a: string; b: string; count: number; why: string }
export interface ComboApplyResult {
  ok: boolean; applied: string[]; skipped: string[];
  beforeTop1: number; afterTop1: number; message: string;
}

// Pure derivation over route rows + cards. No I/O. Deterministic, capped.
// A "phase sequence" A->B = consecutive PICK rows (ts order) with different
// skills and different task_hash. route_logs has no session_id column, so
// cross-task order is the only observable proxy: phase_done between phases
// counts (different tasks in sequence); same-task re-routes do not (an ASK
// re-pick of the same task is one phase, not a combo); self re-routes do not.
export function deriveCombos(rows: ComboRow[], cards: Card[], minCount = 3, maxPairs = 20): ComboPair[] {
  const byId = new Map(cards.map((c) => [c.id, c]));
  const picks = rows
    .filter((r) => r.outcome === "PICK" && r.skill_id)
    .sort((x, y) => x.ts - y.ts);
  const counts = new Map<string, number>();
  for (let i = 1; i < picks.length; i++) {
    const pa = picks[i - 1]!, pb = picks[i]!;
    if (!pa.skill_id || !pb.skill_id) continue;
    if (pa.skill_id === pb.skill_id) continue;
    if (pa.task_hash === pb.task_hash) continue;
    const k = `${pa.skill_id}\x1f${pb.skill_id}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const out: ComboPair[] = [];
  for (const [k, count] of counts) {
    if (count < minCount) continue;
    const [a, b] = k.split("\x1f") as [string, string];
    const ca = byId.get(a), cb = byId.get(b);
    if (!ca || !cb) continue;
    if (ca.tier === "C" || cb.tier === "C") continue;
    if (ca.pairs_with || cb.pairs_with) continue;
    if (ca.cluster && ca.cluster === cb.cluster) continue;
    out.push({ a, b, count, why: `"${a}" then "${b}" locked in sequence ${count}x (min ${minCount})`.slice(0, 160) });
  }
  out.sort((x, y) => y.count - x.count || x.a.localeCompare(y.a) || x.b.localeCompare(y.b));
  return out.slice(0, maxPairs);
}

// Read-only over the live DB via loadAllCards. Never writes. Empty on failure.
export function proposeCombos(opts?: { minCount?: number; maxPairs?: number }): ComboPair[] {
  const minCount = opts?.minCount ?? 3, maxPairs = opts?.maxPairs ?? 20;
  let db: ReturnType<typeof openDb> | null = null;
  try {
    db = openDb();
    const rows = db.query<ComboRow, never>(
      `SELECT ts, task_hash, outcome, skill_id, confidence FROM route_logs`
    ).all();
    return deriveCombos(rows, loadAllCards(db), minCount, maxPairs);
  } catch { return []; }
  finally { try { db?.close(); } catch { /* ignore */ } }
}

// Human-approval path mirroring applyRivalries: snapshot card bytes, eval
// before, set A.pairs_with=B (single string, max-1 per schema) + curated on
// A only, validate, eval after, REFUSE + byte-exact restore on any tune drop.
// ANTI-CREEP CAP: A already carrying pairs_with is skipped, never overwritten
// or appended — repeated applies cannot compound pairs without bound (mirrors
// the 0.3 preferred-boost cap in learn.ts). evalFn/cardsDir injectable so dry
// tests run fully offline on copies. No CLI wiring: never auto-run.
export function applyCombos(
  cwd: string,
  pairs: ComboPair[],
  opts?: { cardsDir?: string; evalFn?: (cwd: string) => { top1: number } }
): ComboApplyResult {
  const fail = (m: string, extra?: Partial<ComboApplyResult>): ComboApplyResult =>
    ({ ok: false, applied: [], skipped: [], beforeTop1: -1, afterTop1: -1, message: m, ...extra });
  if (!pairs.length) return { ok: true, applied: [], skipped: [], beforeTop1: -1, afterTop1: -1, message: "nothing to apply" };
  const cardsDir = opts?.cardsDir ?? join(ROOT, "cards");
  const evalFn = opts?.evalFn ?? ((c: string) => runEval(c));
  const ids = [...new Set(pairs.flatMap((p) => [p.a, p.b]))].sort();
  const snap = new Map<string, string>();
  for (const id of ids) {
    const f = join(cardsDir, `${id}.json`);
    if (existsSync(f)) snap.set(id, readFileSync(f, "utf8"));
  }
  const restore = () => {
    for (const [id, bytes] of snap) writeFileSync(join(cardsDir, `${id}.json`), bytes);
  };
  let beforeTop1 = -1;
  try { beforeTop1 = evalFn(cwd).top1; } catch (e) { return fail(`REFUSED: before-eval failed: ${(e as Error).message}`); }
  const byId = new Map<string, Card>();
  for (const [id, bytes] of snap) {
    try { byId.set(id, JSON.parse(bytes) as Card); }
    catch { restore(); return fail(`REFUSED: ${id}.json unparseable, cards restored`); }
  }
  const skipped: string[] = [];
  for (const p of pairs) {
    const ca = byId.get(p.a), cb = byId.get(p.b);
    if (!ca || !cb) { skipped.push(`${p.a} -> ${p.b} (unknown id)`); continue; }
    if (ca.tier === "C" || cb.tier === "C") { skipped.push(`${p.a} -> ${p.b} (tier C)`); continue; }
    if (ca.pairs_with) { skipped.push(`${p.a} -> ${p.b} (already paired, cap)`); continue; }
    if (ca.cluster && ca.cluster === cb.cluster) { skipped.push(`${p.a} -> ${p.b} (same cluster)`); continue; }
    ca.pairs_with = cb.id;
    ca.curated = true;
  }
  for (const [id, card] of byId) {
    const errs = validateCard(card);
    if (errs.length) { restore(); return fail(`REFUSED: ${id} invalid (${errs.join("; ")}), cards restored`); }
  }
  for (const [id, card] of byId) writeFileSync(join(cardsDir, `${id}.json`), JSON.stringify(card, null, 2) + "\n");
  const skippedSet = new Set(skipped.map((s) => s.split(" (")[0]));
  const applied = pairs
    .filter((p) => !skippedSet.has(`${p.a} -> ${p.b}`))
    .map((p) => `${p.a} -> ${p.b} (pairs_with set)`.slice(0, 160));
  let afterTop1 = -1;
  try { afterTop1 = evalFn(cwd).top1; } catch (e) { restore(); return fail(`REFUSED: after-eval failed: ${(e as Error).message}`, { beforeTop1 }); }
  if (afterTop1 < beforeTop1) {
    restore();
    return { ok: false, applied: [], skipped, beforeTop1, afterTop1, message: `REFUSED: tune top1 ${(beforeTop1 * 100).toFixed(1)}% -> ${(afterTop1 * 100).toFixed(1)}% (cards restored)` };
  }
  return { ok: true, applied: applied.slice(0, 20), skipped, beforeTop1, afterTop1, message: `APPLIED: tune top1 held ${(beforeTop1 * 100).toFixed(1)}% (+${applied.length} pair edges)` };
}
