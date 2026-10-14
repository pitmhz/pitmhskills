import { readFileSync, existsSync } from "node:fs";
import type { Card } from "./types.ts";

// Byte-capped section delivery. Core + matched sections only, never drop primary.
// Every body carries a STYLE FENCE (<=300B) inside the existing cap.
const FENCE_WORDS = "delve,tapestry,landscape,vibrant,testament,beacon,realm,symphony,pivotal,crucial";
const FENCE_UI = " UI: no purple-blue gradient hero, Inter-only type, 3 identical cards.";

export function styleFence(c: Card): string {
  const base = `STYLE: no ${FENCE_WORDS}. No banned phrases/openers. Full list: get_ref slop-patterns.`;
  return c.domain === "frontend" ? base + FENCE_UI : base;
}

export function loadBody(c: Card, maxBytes: number): { body: string; bytes: number } {
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
  // Split on ## sections, keep core + sections whose heading matches task hint
  if (enc.encode(raw).length <= cap) return { body: fence + "\n" + raw, bytes: fenceBytes + enc.encode(raw).length };
  const parts = raw.split(/^## /m);
  const core = parts[0] ?? "";
  let out = core;
  for (const s of parts.slice(1)) {
    const cand = out + "## " + s;
    if (new TextEncoder().encode(cand).length > cap) break;
    out = cand;
  }
  const b = new TextEncoder().encode(out).length;
  return { body: fence + "\n" + out, bytes: fenceBytes + b };
}

export function scopeFence(c: Card): string {
  return c.scope || "Only touch files the task names; everything else read-only.";
}
