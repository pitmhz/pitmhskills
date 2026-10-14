import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export interface SlopHit { file: string; line: number; pattern: string; category: string }
interface Pat { id: string; regex: string; min_count?: number }
interface SlopDB { words: string[]; phrases: string[]; openers: string[]; structural: Pat[]; ui: Pat[]; code: Pat[]; exempt_paths: string[]; fail_on: string[]; word_fail_threshold: number }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export function loadPatterns(): SlopDB {
  return JSON.parse(readFileSync(join(ROOT, "evals", "slop-patterns.json"), "utf8")) as SlopDB;
}

function esc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Templated phrases ("not just X, but Y") become regex; plain ones match literally.
// Apostrophes match straight or curly.
function phraseRx(p: string): RegExp {
  if (/X.+Y/.test(p)) {
    if (/^not just/i.test(p)) return new RegExp("not just .+?, but .+", "i");
    if (/^it.s not/i.test(p)) return new RegExp("it['\u2019]?s not .+?,? it['\u2019]?s .+", "i");
    if (/^whether/i.test(p)) return new RegExp("whether you['\u2019]?re .+? or .+", "i");
  }
  return new RegExp(esc(p).replace(/['\u2019]/g, "['\u2019]"), "i");
}

function openerRx(openers: string[]): RegExp {
  const alt = openers.map((o) => esc(o.replace(/,\s*$/, ""))).join("|");
  return new RegExp("^\\s*(?:[-*>\\d.)\\s]*)?(?:" + alt + "),", "i");
}

// comment-restates-code: comment tokens reappear on the next non-empty line.
function restates(next: string, comment: string): boolean {
  const toks = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
  const cw = new Set(toks(comment));
  if (cw.size < 3) return false;
  const nw = new Set(toks(next));
  let shared = 0;
  for (const w of cw) if (nw.has(w)) shared++;
  return shared >= 3;
}

export function scanText(file: string, text: string, db: SlopDB, allowMarketing: boolean): SlopHit[] {
  const hits: SlopHit[] = [];
  const lines = text.split("\n");
  const wordRxs = allowMarketing ? [] : db.words.map((w) => ({ w, rx: new RegExp("\\b" + esc(w) + "\\b", "i") }));
  const phraseRxs = db.phrases.map((p) => ({ p, rx: phraseRx(p) }));
  const openRx = allowMarketing ? null : openerRx(db.openers);
  const pats: { rx: RegExp; id: string; cat: string; min?: number }[] = [];
  for (const s of db.structural) pats.push({ rx: new RegExp(s.regex, "i"), id: s.id, cat: "structural" });
  for (const u of db.ui) pats.push({ rx: new RegExp(u.regex, "i"), id: u.id, cat: "ui", min: u.min_count });
  for (const c of db.code) pats.push({ rx: new RegExp(c.regex, "i"), id: c.id, cat: "code" });
  const counts = new Map<string, number>();
  lines.forEach((ln, i) => {
    const n = i + 1;
    for (const { w, rx } of wordRxs) if (rx.test(ln)) hits.push({ file, line: n, pattern: w, category: "word" });
    for (const { p, rx } of phraseRxs) if (rx.test(ln)) hits.push({ file, line: n, pattern: p, category: "phrase" });
    if (openRx && openRx.test(ln)) hits.push({ file, line: n, pattern: "opener", category: "opener" });
    for (const p of pats) {
      if (p.min) {
        const m = ln.match(new RegExp(p.rx.source, "gi"));
        counts.set(p.id, (counts.get(p.id) ?? 0) + (m ? m.length : 0));
        continue;
      }
      if (!p.rx.test(ln)) continue;
      if (p.id === "comment-restates-code") {
        const c = ln.replace(/^\s*(?:\/\/|#|\*)\s*/, "");
        const nxt = lines.slice(n).find((l) => l.trim().length > 0) ?? "";
        if (!restates(nxt, c)) continue;
      }
      hits.push({ file, line: n, pattern: p.id, category: p.cat });
    }
  });
  for (const p of pats) {
    if (p.min && (counts.get(p.id) ?? 0) >= p.min!) {
      hits.push({ file, line: 1, pattern: p.id, category: p.cat });
    }
  }
  return hits;
}

export function slopPass(db: SlopDB, hits: SlopHit[]): boolean {
  const words = hits.filter((h) => h.category === "word").length;
  if (words >= db.word_fail_threshold) return false;
  return !hits.some((h) => db.fail_on.includes(h.category));
}

// Profile flag allow_marketing_voice read directly via Bun.file; structural type, null-safe.
export async function runSlopScan(cwd: string, files: string[]): Promise<{ pass: boolean; hits: SlopHit[] }> {
  const db = loadPatterns();
  let allowMarketing = false;
  try {
    const f = Bun.file(join(cwd, ".pitmhskills", "profile.json"));
    if (await f.exists()) {
      const p = (await f.json()) as { allow_marketing_voice?: unknown } | null;
      allowMarketing = !!p && p.allow_marketing_voice === true;
    }
  } catch { allowMarketing = false; }
  const norm = (s: string) => s.replace(/\\/g, "/");
  const hits: SlopHit[] = [];
  for (const rel of files) {
    if (db.exempt_paths.some((e) => norm(rel).includes(e))) continue;
    let text = "";
    try {
      const f = Bun.file(join(cwd, rel));
      if (!(await f.exists())) continue;
      text = await f.text();
    } catch { continue; }
    hits.push(...scanText(norm(rel), text, db, allowMarketing));
  }
  return { pass: slopPass(db, hits), hits };
}

if (import.meta.main) {
  const db = loadPatterns();
  const sloppy = "To delve into the vibrant tapestry of dashboards, leverage synergy. Moreover, it's worth noting the plan.";
  const sloppy2 = "In today's fast-paced world, here's the thing: our hero shows 10k users with Inter font and backdrop-blur.";
  const clean = "The route function picks one skill per task. It reads the task text and returns the best match.";
  const h1 = scanText("s1.md", sloppy, db, false);
  const h2 = scanText("s2.md", sloppy2, db, false);
  const hc = scanText("c.md", clean, db, false);
  console.log(`sloppy1 hits=${h1.length} pass=${slopPass(db, h1)}`);
  console.log(`sloppy2 hits=${h2.length} pass=${slopPass(db, h2)}`);
  console.log(`clean hits=${hc.length} pass=${slopPass(db, hc)}`);
  // Golden file: sloppy entries must fail, clean/case outputs must pass.
  const gold = readFileSync(join(ROOT, "evals", "golden-slop.yaml"), "utf8");
  const vals: { kind: string; text: string }[] = [];
  let kind = "";
  for (const ln of gold.split("\n")) {
    const m = ln.match(/^\s*(sloppy|clean|output):\s*"(.*)"\s*$/);
    if (m) { kind = m[1]!; vals.push({ kind, text: m[2]!.replace(/\\"/g, '"') }); }
  }
  let bad = 0;
  for (const v of vals) {
    const h = scanText("golden", v.text, db, false);
    const pass = slopPass(db, h);
    const wantPass = v.kind !== "sloppy";
    if (pass !== wantPass) { console.log(`GOLDEN MISMATCH kind=${v.kind} hits=${h.map((x) => x.pattern).join(",")}`); bad++; }
  }
  console.log(`golden checked=${vals.length} mismatches=${bad}`);
  if (!slopPass(db, h1) && !slopPass(db, h2) && slopPass(db, hc) && bad === 0) console.log("SLOP DEMO PASS");
  else { console.log("SLOP DEMO FAIL"); process.exit(1); }
}
