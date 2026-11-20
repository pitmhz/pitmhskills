import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Card } from "./types.ts";
import { distillGuard } from "./mandate.ts";
import { stem, STOPWORDS } from "./lexicon.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const DELIVER_CAP = 3000;
const FENCE_CAP = 300;
const FALLBACK_WORDS = ["delve", "tapestry", "landscape", "vibrant", "testament", "beacon", "realm", "symphony", "pivotal", "crucial"];
const FALLBACK_UI = ["purple-blue gradient hero", "Inter-only type", "3 identical cards"];

// Byte-capped, task-matched section delivery. Core + highest-scoring sections
// that fit; never drop primary. Every body carries a STYLE FENCE (<=300B).

interface SlopLists { words: string[]; ui: string[] }
let slopCache: SlopLists | null = null;
// Fence content comes from evals/slop-patterns.json so one data file drives
// both the fence and the scanner. Fall back to constants when the file is absent.
function slopLists(): SlopLists {
  if (slopCache) return slopCache;
  try {
    const j = JSON.parse(readFileSync(join(ROOT, "evals", "slop-patterns.json"), "utf8")) as Record<string, unknown>;
    const words = Array.isArray(j.words) ? (j.words as unknown[]).filter((w): w is string => typeof w === "string") : [];
    const ui = Array.isArray(j.ui)
      ? (j.ui as { id?: unknown }[]).map((u) => String(u?.id ?? "").replace(/-/g, " ")).filter(Boolean)
      : [];
    slopCache = { words: words.length ? words : FALLBACK_WORDS, ui: ui.length ? ui : FALLBACK_UI };
  } catch {
    slopCache = { words: FALLBACK_WORDS, ui: FALLBACK_UI };
  }
  return slopCache;
}

function truncBytes(s: string, max: number): string {
  const enc = new TextEncoder();
  if (enc.encode(s).length <= max) return s;
  return new TextDecoder().decode(enc.encode(s).slice(0, max)).replace(/�+$/u, "");
}

export function styleFence(c: Card): string {
  const { words, ui } = slopLists();
  let f = `STYLE: no ${words.slice(0, 10).join(", ")}. No banned phrases/openers. Full list: get_ref slop-patterns.`;
  if (c.domain === "frontend") f += ` UI: no ${ui.slice(0, 3).join(", ")}.`;
  return truncBytes(f, FENCE_CAP);
}

// One paired skill as a distilled guard (never a second body). Used by
// route.ts for pairs_with and ponytail_mode auto-pairing; respects the byte cap.
export function pairGuard(partner: Card, maxBytes = 1800): string {
  return `\nPAIRED CORE: apply alongside ${partner.id}\n` + distillGuard(partner, maxBytes);
}

function taskWords(task: string): Set<string> {
  return new Set(task.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2));
}

// Goal/provides bias tokens: stemmed, stop-filtered. Each hit is worth x2 in
// the section sort below. Matching stays token-exact (no substring).
function goalWordSet(c: Card): Set<string> {
  const text = [c.goal ?? "", ...(c.provides ?? [])].join(" ");
  const out = new Set<string>();
  for (const w of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (w.length <= 1 || STOPWORDS.has(w)) continue;
    out.add(stem(w));
  }
  return out;
}

// When the body exceeds the cap, pick ## sections by task relevance instead of
// taking an arbitrary prefix. Core (pre-first-##) is always kept; scoring is
// token-exact on both sides (task words vs section head words), so "help" never
// matches "helper" and "page" never matches "pages". Goal/provides tokens add
// x2 per hit (stemmed, stop-filtered). A section with zero hits keeps its file
// order, so behavior without a task match is unchanged.
export function loadBody(c: Card, maxBytes: number, task = ""): { body: string; bytes: number } {
  const fence = styleFence(c);
  const enc = new TextEncoder();
  const fenceBytes = enc.encode(fence + "\n").length;
  const cap = Math.max(0, maxBytes - fenceBytes);
  const p = c.skill_path;
  let raw = "";
  try {
    if (p && existsSync(p)) raw = readFileSync(p, "utf8");
  } catch { raw = ""; }
  if (!raw) raw = `# ${c.id}\n${c.purpose}\n${c.goal ? "\nGoal: " + c.goal : ""}\n\n${(c.when_to_use?.length ? c.when_to_use.join("\n") : c.use_when.join("\n"))}\n\nScope: ${c.scope}\n`;
  if (enc.encode(raw).length <= cap) {
    const p2 = raw.split(/^## /m);
    let labels: string[] = [];
    if (p2.length > 1) {
      const canon = Array.isArray(c.sections) && c.sections.length ? new Map(c.sections.map((m) => [m.name.toLowerCase(), m.name])) : new Map<string, string>();
      labels = p2.slice(1).map((s) => {
        const n = (s.split("\n", 1)[0] ?? "").replace(/\s+#+\s*$/, "").trim();
        return canon.get(n.toLowerCase()) ?? n;
      }).filter(Boolean);
    } else if (Array.isArray(c.sections) && c.sections.length) {
      labels = c.sections.map((m) => m.name);
    } else {
      const paras = raw.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
      labels = paras.slice(1, 6).map((p, i) => (p.slice(0, 40).replace(/\s+/g, " ").trim()) || `Part ${i + 1}`);
    }
    if (labels.length) {
      const h = "SECTIONS: §" + labels.join(" §") + "\n";
      if (enc.encode(h + raw).length <= cap) return { body: fence + "\n" + h + raw, bytes: fenceBytes + enc.encode(h + raw).length };
    }
    return { body: fence + "\n" + raw, bytes: fenceBytes + enc.encode(raw).length };
  }
  const encS = (s: string) => enc.encode(s).length;
  const parts = raw.split(/^## /m);
  const words = taskWords(task);
  const goalWords = goalWordSet(c);
  const addGoal = (hits: number, st: Set<string>): number => {
    if (!goalWords.size) return hits;
    const stStem = new Set([...st].map(stem));
    let gh = 0;
    for (const g of goalWords) if (stStem.has(g)) gh++;
    return hits + gh * 2;
  };
  // Unified item list: ## sections when headings exist, otherwise up to 5
  // paragraph chunks (first 40 chars or Part N). Synthesized in memory only.
  interface Item { s: string; i: number; hits: number; label: string; pre: string }
  let core = parts[0] ?? "";
  let items: Item[] = [];
  if (parts.length > 1) {
    const canon = Array.isArray(c.sections) && c.sections.length ? new Map(c.sections.map((m) => [m.name.toLowerCase(), m.name])) : new Map<string, string>();
    items = parts.slice(1).map((s, i) => {
      const st = taskWords(s.slice(0, 400));
      let hits = 0;
      for (const w of words) if (st.has(w)) hits++;
      const n = (s.split("\n", 1)[0] ?? "").replace(/\s+#+\s*$/, "").trim();
      return { s, i, hits: addGoal(hits, st), label: canon.get(n.toLowerCase()) ?? n, pre: "## " };
    });
    if (words.size > 0) items.sort((a, b) => b.hits - a.hits || a.i - b.i);
  } else {
    const paras = raw.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
    core = paras[0] ?? "";
    items = paras.slice(1, 6).map((p, i) => {
      const st = taskWords(p.slice(0, 400));
      let hits = 0;
      for (const w of words) if (st.has(w)) hits++;
      const label = (p.slice(0, 40).replace(/\s+/g, " ").trim()) || `Part ${i + 1}`;
      return { s: p, i, hits: addGoal(hits, st), label, pre: "" };
    });
    if (words.size > 0) items.sort((a, b) => b.hits - a.hits || a.i - b.i);
  }
  if (encS(core) > cap) core = truncBytes(core, cap);
  const bodyFor = (del: Item[]): string => {
    let out = core;
    for (const e of del) out += (e.pre || "\n\n") + e.s;
    return out;
  };
  const headerFor = (del: Item[]): string => {
    if (del.length === 0) return "";
    const inDel = new Set(del);
    const spill = items.filter((e) => !inDel.has(e)).slice(0, 5);
    let h = "SECTIONS: §" + del.map((e) => e.label).join(" §") + "\n";
    if (spill.length > 0) h += "MORE: §" + spill.map((e) => e.label).join(" §") + " — fetch via get_ref\n";
    return h;
  };
  const picked: Item[] = [];
  {
    let out = core;
    for (const e of items) {
      const cand = out + (e.pre || "\n\n") + e.s;
      if (encS(cand) > cap) continue;
      out = cand;
      picked.push(e);
    }
  }
  let delivered = picked;
  let header = headerFor(delivered);
  let out = bodyFor(delivered);
  while (delivered.length > 0 && encS(header + out) > cap) {
    delivered = delivered.slice(0, -1);
    header = headerFor(delivered);
    out = bodyFor(delivered);
  }
  out = header + out;
  if (encS(out) > cap) out = truncBytes(out, cap);
  const b = enc.encode(out).length;
  return { body: fence + "\n" + out, bytes: fenceBytes + b };
}

export function scopeFence(c: Card): string {
  return c.scope || "Only touch files the task names; everything else read-only.";
}
