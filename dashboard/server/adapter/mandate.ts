import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CONFIG_FILE, ROOT, readJson, repoRel } from "./repo.ts";

// Mode B (RECON: no generator writes agent files). AGENTS.md is the mandate source.
export const MANDATE_MODE = "B" as const;
const CANDIDATES = ["AGENTS.md", "CLAUDE.md", "GEMINI.md", ".cursorrules", ".github/copilot-instructions.md"];
export const ROUTER_COMMAND_HINTS = ["route"];

export function agentFiles(): { rel: string; full: string; bytes: number }[] {
  return CANDIDATES.map((rel) => join(ROOT, rel))
    .filter((f) => existsSync(f))
    .map((full) => ({ rel: repoRel(full), full, bytes: Buffer.byteLength(readFileSync(full, "utf8")) }));
}

export function budget() {
  const cfg = readJson<Record<string, number>>(CONFIG_FILE, {});
  return { target: cfg.mandate_target_bytes ?? 600, cap: cfg.mandate_cap_bytes ?? 1024 };
}

export type Lint = { rule: string; ok: boolean; level: "error" | "warn"; detail?: string };

/** Deterministic, string-based lint from PRD 8.6. Errors block Apply; warnings do not. */
export function lintMandate(text: string): Lint[] {
  const b = budget();
  const bytes = Buffer.byteLength(text);
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const headings = lines.filter((l) => /^#{1,6}\s/.test(l)).length;
  const blocks = [...text.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map((m) => m[1].split("\n").filter(Boolean).length);
  const bad = text.split(/\r?\n/).find((l) => /(load|read|list|search|open).{0,20}(all|every|skills?)/i.test(l) && !/\bnever\b|\bdo not\b|\bdon't\b/i.test(l));
  const pasted = /^---\s*\n\s*name:/m.test(text) || /^description:\s/m.test(text);
  return [
    { rule: "contains the route command", ok: /\broute\b/.test(text), level: "error" },
    { rule: "no instruction to load, list, search or open skills", ok: !bad, level: "error", detail: bad?.trim().slice(0, 120) },
    { rule: `under ${b.cap} B hard cap`, ok: bytes <= b.cap, level: "error", detail: `${bytes} B` },
    { rule: "no pasted skill content", ok: !pasted, level: "error" },
    { rule: "12 lines or fewer", ok: lines.length <= 12, level: "warn", detail: `${lines.length} lines` },
    { rule: "at most one heading", ok: headings <= 1, level: "warn", detail: `${headings} headings` },
    { rule: "no code block longer than 3 lines", ok: blocks.every((n) => n <= 3), level: "warn" },
    { rule: `within ${b.target} B target`, ok: bytes <= b.target, level: "warn", detail: `${bytes} B` },
  ];
}
