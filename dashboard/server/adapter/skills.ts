import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { CARDS_DIR, ROOT } from "./repo.ts";
import { CMD, runCmd } from "./exec.ts";

export type Card = Record<string, unknown> & {
  id: string; tier: string; domain: string; license?: string; origin?: string[];
  cluster?: string; cluster_role?: string; core_bytes?: number; purpose?: string; skill_path?: string;
  sections?: { name: string; bytes: number }[];
};
export type Row = {
  id: string; tier: string; domain: string; cluster: string; role: string; bytes: number;
  license: string; provenance: boolean; state: "ok" | "stale" | "invalid"; purpose: string;
};

let cache: { sig: string; at: number; cards: Card[] } | null = null;

/** All cards, re-read when any card file's mtime or the file count changes (checked at most every 2 s). */
export function loadCards(): Card[] {
  if (cache && Date.now() - cache.at < 2000) return cache.cards;
  const files = readdirSync(CARDS_DIR).filter((f) => f.endsWith(".json")).sort();
  let sum = 0;
  for (const f of files) sum += statSync(join(CARDS_DIR, f)).mtimeMs;
  const sig = `${files.length}:${sum}`;
  if (cache && cache.sig === sig) return (cache.at = Date.now()), cache.cards;
  const cards: Card[] = [];
  for (const f of files) {
    try {
      cards.push(JSON.parse(readFileSync(join(CARDS_DIR, f), "utf8")) as Card);
    } catch {
      cards.push({ id: f.replace(/\.json$/, ""), tier: "?", domain: "?", _parse_error: true });
    }
  }
  cache = { sig, at: Date.now(), cards };
  validated = null;
  return cards;
}
export const cardSig = () => (loadCards(), cache!.sig);

// Provenance = a source origin AND a known license (every card has an origin today).
export const hasProvenance = (c: Card) =>
  Array.isArray(c.origin) && c.origin.length > 0 && !!c.license && !/^UNKNOWN/i.test(c.license);

type Validation = { sig: string; ok: number; bad: Map<string, string[]>; code: number; at: number; raw: string };
let validated: Validation | null = null;

/** Repo validator (`cards --check`), cached until the card signature changes. */
export async function validation(): Promise<Validation> {
  const sig = cardSig();
  if (validated && validated.sig === sig) return validated;
  const r = await runCmd(CMD.validate(), ROOT);
  const bad = new Map<string, string[]>();
  let ok = 0;
  for (const line of r.stdout.split(/\r?\n/)) {
    const m = /^ok=(\d+) bad=\d+/.exec(line);
    if (m) ok = Number(m[1]);
    const b = /^(.+?)\.json: (.*)$/.exec(line);
    if (b) bad.set(b[1], b[2].split("; "));
  }
  validated = { sig, ok, bad, code: r.code, at: Date.now(), raw: r.stdout.slice(0, 4000) };
  return validated;
}

export function toRow(c: Card, v: Validation | null): Row {
  const errs = v?.bad.get(c.id) ?? [];
  const state = errs.length === 0 ? "ok" : errs.some((e) => e.startsWith("stale")) ? "stale" : "invalid";
  return {
    id: c.id, tier: String(c.tier), domain: String(c.domain ?? ""), cluster: String(c.cluster ?? ""),
    role: String(c.cluster_role ?? "primary"), bytes: Number(c.core_bytes ?? 0), license: String(c.license ?? ""),
    provenance: hasProvenance(c), state, purpose: String(c.purpose ?? "").slice(0, 160),
  };
}

export const findCard = (id: string) => loadCards().find((c) => c.id === id);

/** Body preview of a card's SKILL.md (read-only). Never called in bulk. */
export function bodyOf(c: Card, cap: number): { text: string; bytes: number; truncated: boolean } {
  try {
    const raw = readFileSync(String(c.skill_path), "utf8");
    const bytes = Buffer.byteLength(raw);
    return { text: raw.slice(0, cap), bytes, truncated: raw.length > cap };
  } catch {
    return { text: "", bytes: 0, truncated: false };
  }
}
