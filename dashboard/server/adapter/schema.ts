import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./repo.ts";
import type { Card } from "./skills.ts";

export type FieldType = "string" | "text" | "string[]" | "enum" | "boolean" | "number" | "object" | "reference";
export type Field = { name: string; type: FieldType; required: boolean; observed: number; options?: string[] };

const REFERENCES = new Set(["cluster", "pairs_with"]);
const READ_ONLY = new Set(["id", "hash", "origin", "body_tokens", "core_bytes", "sections", "skill_path"]);

/** Required set + enums read from the repo's zod schema source; types observed from the cards. */
function fromSource(): { required: Set<string>; enums: Map<string, string[]> } {
  let src = "";
  try {
    src = readFileSync(join(ROOT, "src", "types.ts"), "utf8");
  } catch { /* fall back to the 95% rule */ }
  const req = /const required = new Set\(\[([^\]]+)\]\)/.exec(src);
  const required = new Set((req?.[1] ?? "").match(/"([^"]+)"/g)?.map((s) => s.slice(1, -1)) ?? []);
  const enums = new Map<string, string[]>();
  for (const m of src.matchAll(/(\w+): z\.enum\(\[([^\]]+)\]\)/g)) {
    enums.set(m[1], m[2].match(/"([^"]+)"/g)!.map((s) => s.slice(1, -1)));
  }
  return { required, enums };
}

let cached: { n: number; fields: Field[] } | null = null;

export function discoverSchema(cards: Card[]): Field[] {
  if (cached && cached.n === cards.length) return cached.fields;
  const { required, enums } = fromSource();
  const seen = new Map<string, { n: number; kinds: Map<string, number>; long: number }>();
  for (const c of cards) {
    for (const [k, v] of Object.entries(c)) {
      if (k.startsWith("_")) continue;
      const s = seen.get(k) ?? { n: 0, kinds: new Map(), long: 0 };
      s.n++;
      const kind = Array.isArray(v) ? (v.every((x) => typeof x === "string") ? "string[]" : "object") : v === null ? "null" : typeof v;
      s.kinds.set(kind, (s.kinds.get(kind) ?? 0) + 1);
      if (typeof v === "string" && v.length > 120) s.long++;
      seen.set(k, s);
    }
  }
  const fields: Field[] = [];
  for (const [name, s] of seen) {
    const top = [...s.kinds.entries()].filter(([k]) => k !== "null").sort((a, b) => b[1] - a[1])[0]?.[0] ?? "string";
    const type: FieldType =
      enums.has(name) ? "enum" : REFERENCES.has(name) ? "reference" : top === "string" ? (s.long > s.n * 0.2 ? "text" : "string")
      : top === "string[]" ? "string[]" : top === "boolean" ? "boolean" : top === "number" ? "number" : "object";
    const observed = Math.round((s.n / cards.length) * 1000) / 10;
    fields.push({
      name, type, observed, options: enums.get(name),
      required: required.size ? required.has(name) : observed >= 95,
    });
  }
  cached = { n: cards.length, fields };
  return fields;
}

export const isReadOnlyField = (name: string) => READ_ONLY.has(name);
