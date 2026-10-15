import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openDb } from "./db.ts";
import { loadAllCards } from "./retrieve.ts";
import { runEval } from "./eval.ts";
import { validateCard, type Card } from "./types.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export interface RivalPair { a: string; b: string; why: string }
export interface RivalApplyResult {
  ok: boolean; applied: string[]; skipped: string[];
  beforeTop1: number; afterTop1: number; message: string;
}

const STOP = new Set(("a,an,the,and,or,for,with,from,that,this,these,those,when,while,where,which,who,your,you,use,using,skill,tasks,task,only,into,over,under,through,within,without,about,also,more,most,other,such,than,too,very,can,will,just,each,all,any,both,are,was,were,has,have,had,been,does,not,but,per,via").split(","));

function tokensOf(c: Card): Set<string> {
  const out = new Set<string>();
  const text = [c.purpose, ...(c.use_when ?? []), c.disambiguator ?? ""].join("\n").toLowerCase();
  for (const t of text.split(/[^a-z0-9]+/)) {
    if (t.length < 4 || STOP.has(t) || /^\d+$/.test(t)) continue;
    out.add(t);
  }
  return out;
}

// Pure derivation. Same-cluster pairs sharing >=3 distinctive tokens (seen in
// few cluster-mates, beyond the cluster's generic vocabulary) are implicit
// rivals. Deterministic, capped, no I/O.
export function deriveRivalries(cards: Card[], maxPairs = 50, minShared = 3): RivalPair[] {
  const byCluster = new Map<string, Card[]>();
  for (const c of cards) {
    if (!c.cluster) continue;
    const l = byCluster.get(c.cluster) ?? [];
    l.push(c);
    byCluster.set(c.cluster, l);
  }
  const out: RivalPair[] = [];
  const clusters = [...byCluster.entries()].sort((x, y) => x[0].localeCompare(y[0]));
  for (const [cluster, list] of clusters) {
    if (list.length < 2) continue;
    const toks = new Map<string, Set<string>>();
    const df = new Map<string, number>();
    for (const c of list) {
      const t = tokensOf(c);
      toks.set(c.id, t);
      for (const w of t) df.set(w, (df.get(w) ?? 0) + 1);
    }
    const generic = new Set<string>();
    for (const [w, n] of df) if (n > Math.max(2, list.length / 2)) generic.add(w);
    const ids = list.map((c) => c.id).sort();
    const known = new Map(list.map((c) => [c.id, c]));
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const a = known.get(ids[i]!)!, b = known.get(ids[j]!)!;
      if ((a.conflicts_with ?? []).includes(b.id) || (b.conflicts_with ?? []).includes(a.id)) continue;
      const ta = toks.get(a.id)!, tb = toks.get(b.id)!;
      const shared = [...ta].filter((w) => tb.has(w) && !generic.has(w)).sort();
      if (shared.length < minShared) continue;
      const why = `cluster "${cluster}": ${shared.length} shared distinctive tokens (${shared.slice(0, 6).join(", ")})`.slice(0, 160);
      out.push({ a: a.id, b: b.id, why });
    }
  }
  out.sort((x, y) => x.a.localeCompare(y.a) || x.b.localeCompare(y.b));
  return out.slice(0, maxPairs);
}

// Read-only over the DB via loadAllCards. Never writes. Empty on read failure.
export function proposeRivalries(maxPairs = 50): RivalPair[] {
  let db: ReturnType<typeof openDb> | null = null;
  try {
    db = openDb();
    return deriveRivalries(loadAllCards(db), maxPairs);
  } catch { return []; }
  finally { try { db?.close(); } catch { /* ignore */ } }
}

// Human-approval path mirroring learn --apply: snapshot card bytes, eval
// before, edit files, validate, eval after, REFUSE + byte-exact restore on
// any tune drop or invalid card. Returns ok:false (caller maps to non-zero).
// evalFn/cardsDir are injectable so dry tests run fully offline on copies;
// default is the live in-process runEval over the repo cards dir. No CLI.
export function applyRivalries(
  cwd: string,
  pairs: RivalPair[],
  opts?: { cardsDir?: string; evalFn?: (cwd: string) => { top1: number } }
): RivalApplyResult {
  const fail = (m: string, extra?: Partial<RivalApplyResult>): RivalApplyResult =>
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
    if (!ca || !cb) { skipped.push(`${p.a} <-> ${p.b} (unknown id)`); continue; }
    let touched = false;
    const sides: Array<[Card, Card]> = [[ca, cb], [cb, ca]];
    for (const [self, other] of sides) {
      const cur = Array.isArray(self.conflicts_with) ? self.conflicts_with : [];
      if (!cur.includes(other.id)) { self.conflicts_with = [...cur, other.id]; touched = true; }
    }
    if (!touched) { skipped.push(`${p.a} <-> ${p.b} (already rivals)`); continue; }
    ca.curated = true; cb.curated = true;
  }
  for (const [id, card] of byId) {
    const errs = validateCard(card);
    if (errs.length) { restore(); return fail(`REFUSED: ${id} invalid (${errs.join("; ")}), cards restored`); }
  }
  for (const [id, card] of byId) writeFileSync(join(cardsDir, `${id}.json`), JSON.stringify(card, null, 2) + "\n");
  const skippedSet = new Set(skipped.map((s) => s.split(" (")[0]));
  const applied = pairs
    .filter((p) => !skippedSet.has(`${p.a} <-> ${p.b}`))
    .map((p) => `${p.a} <-> ${p.b} (conflicts_with +1 each)`.slice(0, 160));
  let afterTop1 = -1;
  try { afterTop1 = evalFn(cwd).top1; } catch (e) { restore(); return fail(`REFUSED: after-eval failed: ${(e as Error).message}`, { beforeTop1 }); }
  if (afterTop1 < beforeTop1) {
    restore();
    return { ok: false, applied: [], skipped, beforeTop1, afterTop1, message: `REFUSED: tune top1 ${(beforeTop1 * 100).toFixed(1)}% -> ${(afterTop1 * 100).toFixed(1)}% (cards restored)` };
  }
  return { ok: true, applied: applied.slice(0, 20), skipped, beforeTop1, afterTop1, message: `APPLIED: tune top1 held ${(beforeTop1 * 100).toFixed(1)}% (+${applied.length} rival edges)` };
}
