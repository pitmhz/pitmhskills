import { STOPWORDS } from "./retrieve.ts";

// Card text derivation: slugs, domain/task guesses, use_when mining, heading
// keywords. Pure functions over SKILL.md text; no fs, no db. Kept in its own
// module so card.ts (build orchestration) stays under the 200-line cap.

export function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "skill";
}

export function guessDomain(t: string): string {
  const l = t.toLowerCase();
  // Short tokens need word boundaries: "edge cases" prose must not match edge-compute.
  if (/\bworker\b|\bcloudflare\b|\bedge\b|\bkv\b|\bd1\b|\br2\b|\bwaf\b/.test(l)) return "cloudflare-edge";
  if (/supabase|postgres|rls|sql/.test(l)) return "backend-data";
  if (/react|next|frontend|gsap|animat|ui\b|dashboard/.test(l)) return "frontend";
  if (/cuda|nvidia|nim|tensor|gpu/.test(l)) return "gpu-compute";
  if (/memory|cavemem|retriev|rag/.test(l)) return "memory";
  if (/grill|review|spec|ticket|triage/.test(l)) return "workflow";
  return "general";
}

export function guessTaskTypes(t: string): string[] {
  const l = t.toLowerCase();
  const out = new Set<string>();
  if (/review|audit|lint/.test(l)) out.add("review");
  if (/refactor|optim/.test(l)) out.add("refactor");
  if (/implement|build|create|add/.test(l)) out.add("implement");
  if (/debug|fix|troubleshoot/.test(l)) out.add("debug");
  if (/design/.test(l)) out.add("design");
  if (out.size === 0) out.add("implement");
  return [...out];
}

// Mine use_when triggers from vendor body text ("Use when...", "Triggers on...",
// "should be used when..."). Template cards otherwise carry only the one-line
// description, which is too thin for retrieval to clear floor on niche skills.
export function mineUseWhen(body: string, desc: string): string[] {
  const out = [desc.slice(0, 160)];
  for (const raw of body.split("\n")) {
    if (out.length >= 4) break;
    if (!/use when|triggers on|should be used when/i.test(raw)) continue;
    const t = raw.replace(/^[\s>#\-*`|]+/, "").trim();
    const m = t.match(/(?:use (?:this skill )?when|triggers on|should be used when)\s*[:\-–—]?\s*(.+)/i);
    const s = (m?.[1] ?? t).trim().replace(/\*\*/g, "");
    if (s.length >= 25 && s.length <= 220 && !out.some((o) => o.includes(s.slice(0, 40)) || s.includes(o.slice(0, 40)))) {
      out.push(s.slice(0, 160));
    }
  }
  return out;
}

// Body-term keywords: distinctive words from the skill's own HEADINGS (## lines),
// which are topical by construction. Full-body TF-IDF was tried and rejected:
// incidental mentions (tool names, platform words) pollute the index and dilute
// embeddings. Headings + mined use_when lines carry the routing signal.
// Folded into the index text only; the card's use_when stays human-readable.
export function extractKeywords(raw: string, covered: string): string[] {
  const stop = new Set([...STOPWORDS, ...covered.toLowerCase().split(/[^a-z0-9]+/)]);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const line of raw.split("\n")) {
    if (out.length >= 12) break;
    const m = line.match(/^#{1,4}\s+(.+)/);
    if (!m) continue;
    for (const t of m[1]!.toLowerCase().split(/[^a-z0-9]+/)) {
      if (t.length < 4 || stop.has(t) || seen.has(t)) continue;
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

// Section map for oversized skills: one entry per ##/### heading. Name is the
// heading text (sliced), bytes is the section byte length (heading line
// through the line before the next same-or-higher-level heading, or EOF, so
// a ## section includes its nested ### subsections), when is the distinctive
// heading words (len>=4, minus STOPWORDS, cap 8). No-headings skills -> [].
export function extractSections(raw: string): { name: string; bytes: number; when: string[] }[] {
  const lines = raw.split("\n");
  // Byte offset of each line start in the original string.
  const starts: number[] = new Array<number>(lines.length);
  let off = 0;
  for (let i = 0; i < lines.length; i++) {
    starts[i] = off;
    off += lines[i]!.length + 1; // +1 for the "\n" split away
  }
  const heads: { line: number; level: number; text: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i]!.match(/^#{2,3}\s+(.+)/);
    if (!m) continue;
    const level = lines[i]!.startsWith("###") ? 3 : 2;
    heads.push({ line: i, level, text: m[1]!.trim() });
  }
  const enc = new TextEncoder();
  return heads.map((h, i) => {
    let end = raw.length;
    for (let j = i + 1; j < heads.length; j++) {
      if (heads[j]!.level <= h.level) {
        end = starts[heads[j]!.line]!;
        break;
      }
    }
    const bytes = enc.encode(raw.slice(starts[h.line]!, end)).length;
    const when: string[] = [];
    const seen = new Set<string>();
    for (const t of h.text.toLowerCase().split(/[^a-z0-9]+/)) {
      if (when.length >= 8) break;
      if (t.length < 4 || STOPWORDS.has(t) || seen.has(t)) continue;
      seen.add(t);
      when.push(t);
    }
    return { name: h.text.slice(0, 80), bytes, when };
  });
}

// Spec-valid staging frontmatter: Agent Skills interop subset for uiskills-staged flow.
// Maps card use_when[0..2] -> when_to_use; fixed compatibility + metadata source.
export function specFrontmatter(card: { name: string; description: string; license: string; use_when: string[] }): string {
  const when = card.use_when.slice(0, 3).join("; ");
  const lines = [
    "---",
    `name: ${JSON.stringify(card.name)}`,
    `description: ${JSON.stringify(card.description)}`,
    `license: ${JSON.stringify(card.license)}`,
    `when_to_use: ${JSON.stringify(when)}`,
    `compatibility: ${JSON.stringify("pitmhskills")}`,
    "metadata:",
    `  source: ${JSON.stringify("pitmhskills")}`,
    "---",
  ];
  return lines.join("\n");
}
