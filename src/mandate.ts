import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { RepoProfile } from "./profile.ts";
import type { Card } from "./types.ts";

export const MANDATE_CAP = 600;

function truncBytes(s: string, max: number, suffix: string): string {
  const enc = new TextEncoder();
  const raw = enc.encode(s);
  if (raw.length <= max) return s;
  const suf = enc.encode(suffix);
  const cut = Math.max(0, max - suf.length);
  const dec = new TextDecoder();
  const head = dec.decode(raw.slice(0, cut)).replace(/\uFFFD+$/u, "");
  return head + suffix;
}

export function buildMandate(p: RepoProfile): string {
  const lines = [
    "Call `route` with every task; use only the returned skill; if ABSTAIN proceed bare; if ASK ask the user.",
  ];
  if (p.mandatory.length === 0) {
    lines.push("MANDATORY: none");
  } else {
    for (const m of p.mandatory) lines.push(`MANDATORY: ${m.id} (${m.why})`);
  }
  if (p.blocked.length > 0) lines.push(`BLOCKED: ${p.blocked.length} skills excluded`);
  if (p.ponytail_mode && p.ponytail_mode !== "off") lines.push(`PONYTAIL: ${p.ponytail_mode} (smallest sufficient change)`);
  return truncBytes(lines.join("\n"), MANDATE_CAP, "...");
}

export function distillGuard(card: Card, maxBytes = 1800): string {
  const lines = [`${card.id}: ${card.purpose}`, "Use when:"];
  for (const u of card.use_when.slice(0, 3)) lines.push(`- ${u}`);
  lines.push(`Scope: ${card.scope}`, "Not for:");
  for (const d of card.do_not_use_when.slice(0, 2)) lines.push(`- ${d}`);
  lines.push("Slop: plain words, no banned patterns.");
  return truncBytes(lines.join("\n"), maxBytes, "…(full body via get_ref)");
}

if (import.meta.main) {
  const enc = new TextEncoder();
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  const card = JSON.parse(readFileSync(join(root, "cards", "local__cavemem.json"), "utf8")) as Card;
  const sample: RepoProfile = {
    version: 1,
    stack: ["bun", "typescript"],
    signals_sha: "demo",
    mandatory: [{ id: "local__cavemem", why: "repo-wide memory", guard_bytes: 1800 }],
    preferred: [],
    blocked: ["pocock__grill-me"],
    grill_answers: [],
    budget: { always_on_bytes: 2048, per_task_bytes: 20480 },
    updated_at: Date.now(),
  };
  const mandate = buildMandate(sample);
  const guard = distillGuard(card);
  const mb = enc.encode(mandate).length;
  const gb = enc.encode(guard).length;
  console.log("--- mandate ---");
  console.log(mandate);
  console.log("--- guard ---");
  console.log(guard);
  console.log(`mandate ${mb}B ${mb <= MANDATE_CAP ? "PASS" : "FAIL"} (cap ${MANDATE_CAP})`);
  console.log(`guard ${gb}B ${gb <= 1800 ? "PASS" : "FAIL"} (cap 1800)`);
  if (mb > MANDATE_CAP || gb > 1800) process.exit(1);
}
