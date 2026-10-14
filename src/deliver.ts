import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Card } from "./types.ts";
import { distillGuard } from "./mandate.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
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

// When the body exceeds the cap, pick ## sections by task relevance instead of
// taking an arbitrary prefix. Core (pre-first-##) is always kept; scoring is
// token-exact on both sides (task words vs section head words), so "help" never
// matches "helper" and "page" never matches "pages". A section with zero hits
// keeps its file order, so behavior without a task match is unchanged.
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
  if (!raw) raw = `# ${c.id}\n${c.purpose}\n\n${c.use_when.join("\n")}\n\nScope: ${c.scope}\n`;
  if (enc.encode(raw).length <= cap) return { body: fence + "\n" + raw, bytes: fenceBytes + enc.encode(raw).length };
  const parts = raw.split(/^## /m);
  const core = parts[0] ?? "";
  const words = taskWords(task);
  const scored = parts.slice(1).map((s, i) => {
    const st = taskWords(s.slice(0, 400));
    let hits = 0;
    for (const w of words) if (st.has(w)) hits++;
    return { s, i, hits };
  });
  if (words.size > 0) scored.sort((a, b) => b.hits - a.hits || a.i - b.i);
  // No section map: legacy path, header-free.
  if (!Array.isArray(c.sections) || c.sections.length === 0) {
    let out = core;
    for (const { s } of scored) {
      const cand = out + "## " + s;
      if (enc.encode(cand).length > cap) continue;
      out = cand;
    }
    const b = enc.encode(out).length;
    return { body: fence + "\n" + out, bytes: fenceBytes + b };
  }
  // Section map header. Delivered sections are named in a SECTIONS line and up
  // to 5 spilled sections in a MORE trailer; both live inside the byte cap, so
  // low-priority picks are dropped until header + core + sections fit.
  const canon = new Map(c.sections.map((m) => [m.name.toLowerCase(), m.name]));
  const secName = (s: string): string => {
    const n = (s.split("\n", 1)[0] ?? "").replace(/\s+#+\s*$/, "").trim();
    return canon.get(n.toLowerCase()) ?? n;
  };
  const bodyFor = (del: typeof scored): string => {
    let out = core;
    for (const e of del) out += "## " + e.s;
    return out;
  };
  const headerFor = (del: typeof scored): string => {
    if (del.length === 0) return "";
    const inDel = new Set(del);
    const spill = scored.filter((e) => !inDel.has(e)).slice(0, 5);
    let h = "SECTIONS: §" + del.map((e) => secName(e.s)).join(" §") + "\n";
    if (spill.length > 0) h += "MORE: §" + spill.map((e) => secName(e.s)).join(" §") + " — fetch via get_ref\n";
    return h;
  };
  let picked: typeof scored = [];
  {
    let out = core;
    for (const e of scored) {
      const cand = out + "## " + e.s;
      if (enc.encode(cand).length > cap) continue;
      out = cand;
      picked.push(e);
    }
  }
  let delivered = picked;
  let header = headerFor(delivered);
  let out = bodyFor(delivered);
  while (delivered.length > 0 && enc.encode(header + out).length > cap) {
    delivered = delivered.slice(0, -1);
    header = headerFor(delivered);
    out = bodyFor(delivered);
  }
  out = header + out;
  const b = enc.encode(out).length;
  return { body: fence + "\n" + out, bytes: fenceBytes + b };
}

export function scopeFence(c: Card): string {
  return c.scope || "Only touch files the task names; everything else read-only.";
}
