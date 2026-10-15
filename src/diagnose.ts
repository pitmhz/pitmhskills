import { openDb, initDb, loadConfig } from "./db.ts";
import { existsSync, readFileSync } from "node:fs";
import { detectSignals } from "./signals.ts";
import { hardFilter } from "./gate.ts";
import { retrieve, loadAllCards } from "./retrieve.ts";
import { collapse } from "./collapse.ts";
import { scoreCandidates, decide } from "./decide.ts";
import { loadProfile } from "./profile.ts";
import type { Card, RankedCard } from "./types.ts";

// diagnose: read-only routing trace. Reuses the route pipeline directly
// with no lock and no log writes. Output capped like other commands.
const CAP = 15;
const cut = (s: string) => s.slice(0, 160);

function toks(s: string): Set<string> {
  return new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2));
}

function gateLines(dropped: { id: string; why: string }[], byId: Map<string, Card>, task: string): string[] {
  const tt = toks(task);
  const rel = dropped.filter((d) => {
    const c = byId.get(d.id);
    if (!c) return false;
    const ct = toks(`${c.id} ${c.purpose} ${c.do_not_use_when.join(" ")}`);
    for (const t of tt) if (ct.has(t)) return true;
    return false;
  });
  const out = [`GATE DROPS (total=${dropped.length} relevant=${rel.length}):`];
  if (!rel.length) out.push("  (none share task tokens)");
  for (const d of rel.slice(0, CAP)) out.push(`  - ${cut(d.id)} :: ${cut(d.why)}`);
  if (rel.length > CAP) out.push(`  ... and ${rel.length - CAP} more`);
  return out;
}

function retrievalLines(ranked: RankedCard[]): string[] {
  const out = [`RETRIEVAL (n=${ranked.length}):`];
  ranked.slice(0, CAP).forEach((r, i) => {
    const bm = r.bm25 >= 999 ? "-" : String(r.bm25);
    out.push(`  ${i + 1}. ${cut(r.card.id)} fused=${r.fused.toFixed(3)} bm=${bm} vec=${r.vec.toFixed(3)} ${cut(r.card.cluster || "-")}/${r.card.cluster_role || "primary"}`);
  });
  return out;
}

function hitPredicate(task: string, cond: string | null): boolean {
  if (!cond) return false;
  const tt = new Set(task.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 0));
  const keys = cond.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3);
  return keys.some((k) => tt.has(k));
}

function collapseLines(ranked: RankedCard[], collapsed: RankedCard[], task: string): string[] {
  const groups = new Map<string, RankedCard[]>();
  for (const r of ranked) {
    const k = r.card.cluster?.trim() || `__solo:${r.card.id}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
  }
  const win = new Map(collapsed.map((r) => [r.card.id, r]));
  const out = [`COLLAPSE WINNERS (clusters=${groups.size}):`];
  const keys = [...groups.keys()].sort().slice(0, CAP);
  for (const k of keys) {
    const g = groups.get(k)!;
    const w = g.find((r) => win.has(r.card.id)) ?? g[0]!;
    const label = k.startsWith("__solo:") ? "(solo)" : cut(k);
    const note = w.card.cluster_role === "variant" && hitPredicate(task, w.card.pick_over_primary_when ?? null) ? " +predicate-hit" : "";
    out.push(`  ${label} -> ${cut(w.card.id)} (${w.card.cluster_role || "primary"})${note}`);
  }
  if (groups.size > CAP) out.push(`  ... and ${groups.size - CAP} more`);
  return out;
}

function decisionLines(ranking: { id: string; score: number; reason: string }[], d: { outcome: string; top: { id: string; score: number } | null; second: { id: string; score: number } | null }, why: string): string[] {
  const out = ["DECISION:"];
  for (const [i, r] of ranking.slice(0, 3).entries()) out.push(`  ${i + 1}. ${cut(r.id)} score=${r.score} :: ${cut(r.reason)}`);
  const m = d.top && d.second ? d.top.score - d.second.score : 99;
  out.push(`  OUTCOME: ${d.outcome}`);
  out.push(`  SKILL: ${d.top?.id ?? "NONE"}`);
  out.push(`  CONFIDENCE: ${d.top?.score ?? 0} MARGIN: ${m}`);
  out.push(`  WHY: ${cut(why)}`);
  return out;
}

// SECTIONS block: read-only mirror of deliver.ts loadBody packing (no import).
// Section tokens duplicate deliver's taskWords exactly: lowercase split on
// /[^a-z0-9]+/, len>2. Hits = task tokens ∩ (name + when) tokens; order is
// hits desc with file-order tiebreak; greedy core-first first-fit against the
// 3000B delivery cap, then deliver's header-trim loop. Lists only, no body.
function sectionLines(focus: Card | null, task: string): string[] {
  if (!focus) return ["SECTIONS: (no candidate)"];
  const secs = Array.isArray(focus.sections) ? focus.sections : [];
  const head = `SECTIONS (${cut(focus.id)} n=${secs.length}):`;
  if (!secs.length) return [head, "  (no section map)"];
  const tw = new Set(task.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2));
  const sw = (s: string): Set<string> => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2));
  const scored = secs.map((m, i) => {
    const st = sw(`${m.name} ${(m.when ?? []).join(" ")}`);
    let h = 0;
    for (const w of tw) if (st.has(w)) h++;
    return { m, i, h };
  });
  scored.sort((a, b) => b.h - a.h || a.i - b.i);
  const enc = new TextEncoder();
  const CAPB = 3000;
  let core = 0;
  try {
    if (focus.skill_path && existsSync(focus.skill_path)) {
      core = enc.encode(readFileSync(focus.skill_path, "utf8").split(/^## /m)[0] ?? "").length;
    }
  } catch { core = 0; }
  const fit: typeof scored = [];
  let used = core;
  for (const e of scored) {
    if (used + e.m.bytes <= CAPB) { fit.push(e); used += e.m.bytes; }
  }
  const hFor = (del: typeof scored): string => {
    if (!del.length) return "";
    const inD = new Set(del);
    const sp = scored.filter((e) => !inD.has(e)).slice(0, 5);
    let h = "SECTIONS: §" + del.map((e) => e.m.name).join(" §") + "\n";
    if (sp.length) h += "MORE: §" + sp.map((e) => e.m.name).join(" §") + "\n";
    return h;
  };
  let header = hFor(fit);
  while (fit.length && enc.encode(header).length + used > CAPB) {
    const e = fit.pop()!;
    used -= e.m.bytes;
    header = hFor(fit);
  }
  const inF = new Set(fit);
  const spill = scored.filter((e) => !inF.has(e));
  const out = [head];
  for (const e of fit) out.push(`  pick §${cut(e.m.name)} ${e.m.bytes}B hits=${e.h}`);
  const room = Math.max(0, 10 - fit.length);
  for (const e of spill.slice(0, room)) out.push(`  spill §${cut(e.m.name)} ${e.m.bytes}B hits=${e.h}`);
  if (spill.length > room) out.push(`  ... and ${spill.length - room} more spilled`);
  out.push(`  PICKED: ${fit.length ? cut(`§${fit.map((e) => e.m.name).join(" §")}`) : "(none)"}`);
  out.push(`  SPILLED: ${spill.length ? cut(`§${spill.map((e) => e.m.name).join(" §")}`) : "(none)"}`);
  return out;
}

// TEACHES block: topic→skills lookup ("who teaches X?"). Pure derivation from
// already-loaded cards: task tokens ∩ (sections[].when + use_when + keywords).
// Tokens taught by >10 skills are generic noise and dropped. Skills per topic
// ranked by distinct task-token coverage desc, id asc tiebreak. Deterministic.
const TSTOP = new Set("about,after,again,also,build,code,could,create,data,file,for,from,help,into,line,list,make,more,most,need,other,page,project,should,show,simple,some,such,task,text,thing,using,want,with,work,write,your".split(","));
function teachesLines(pool: Card[], task: string): string[] {
  const head = "TEACHES:";
  const tt = [...toks(task)].filter((t) => !TSTOP.has(t)).sort();
  const tm = pool.map((c) => ({ id: c.id, s: new Set(`${(c.sections ?? []).flatMap((s) => s.when ?? []).join(" ")} ${(c.use_when ?? []).join(" ")} ${(c.keywords ?? []).join(" ")}`.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2)) }));
  const cov = new Map(tm.map((e) => [e.id, tt.filter((t) => e.s.has(t)).length]));
  const rows = tt.map((t) => ({ t, who: tm.filter((e) => e.s.has(t)).sort((a, b) => cov.get(b.id)! - cov.get(a.id)! || (a.id < b.id ? -1 : 1)).slice(0, 3).map((e) => e.id) })).filter((r) => r.who.length > 0 && r.who.length <= 10);
  rows.sort((a, b) => cov.get(b.who[0])! - cov.get(a.who[0])! || (a.t < b.t ? -1 : 1));
  if (!rows.length) return [head, "  (no distinctive topics)"];
  return [head, ...rows.slice(0, 8).map((r) => `  ${cut(r.t)} -> ${r.who.map(cut).join(", ")}`)];
}

export function runDiagnose(task: string, cwd: string): string {
  const cfg = loadConfig();
  const db = openDb();
  try {
    initDb(db);
    const sig = detectSignals(cwd);
    let profile = null;
    try { profile = loadProfile(cwd); } catch { profile = null; }
    const boosts = new Map<string, number>();
    if (profile) for (const p of profile.preferred ?? []) boosts.set(p.id, p.boost ?? 0.1);
    const all = loadAllCards(db);
    const byId = new Map(all.map((c) => [c.id, c]));
    const { kept, dropped } = hardFilter(all, task, sig, profile);
    const pool = kept.filter((c) => c.tier === "A" || c.tier === "B");
    const ranked = retrieve(db, task, pool, cfg.top_k_retrieve as number, boosts);
    const snap = ranked.map((r) => ({ ...r }));
    const collapsed = collapse(ranked, task);
    const ranking = scoreCandidates(collapsed, task);
    const d = decide(ranking, collapsed, cfg.floor as number, cfg.margin as number, cfg.pick_floor as number);
    const topReason = d.top ? (ranking.find((r) => r.id === d.top!.id)?.reason ?? "") : "no candidates";
    const topCard = d.top ? (byId.get(d.top.id) ?? null) : null;
    const focus = topCard ?? collapsed[0]?.card ?? null;
    const lines = [`TASK: ${cut(task)}`, ...gateLines(dropped, byId, task), ...retrievalLines(snap), ...collapseLines(ranked, collapsed, task), ...decisionLines(ranking, d, topReason), ...sectionLines(focus, task), ...teachesLines(pool, task)];
    return lines.join("\n");
  } finally {
    try { db.close(); } catch { /* ignore */ }
  }
}
