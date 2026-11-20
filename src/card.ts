import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import yaml from "js-yaml";
import { hashContent, loadSources } from "./ingest.ts";
import { shaFile } from "./index.ts";
import { slug, resolveDomain, guessTaskTypes, mineUseWhen, extractKeywords, extractSections } from "./cardtext.ts";
import type { Card } from "./types.ts";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CARDS_DIR = join(ROOT, "cards");
// Build/refresh cards from raw skills. Offline template first; LLM upgrade fills
// use_when/do_not_use_when/disambiguator better. Cached by hash. Curated cards
// (curated:true) are NEVER overwritten: hash match -> cached, hash drift ->
// reported as stale for human re-review (checkCards flags them).
export function buildCards(opts: { check?: boolean; provider?: string }): { made: number; cached: number; deduped: { kept: string; dropped: string }[]; stale: string[]; errors: string[]; goalCoverage: { withGoal: number; total: number } } {
  mkdirSync(CARDS_DIR, { recursive: true });
  const sources = loadSources().filter((s) => !opts.provider || s.id === opts.provider);
  let made = 0, cached = 0, withGoal = 0, total = 0;
  const deduped: { kept: string; dropped: string }[] = [];
  const stale: string[] = [];
  const errors: string[] = [];
  const hashFirst = new Map<string, string>();
  for (const s of sources) {
    const skillFiles = findSkillFiles(s.id, s.path ? join(ROOT, s.path) : join(ROOT, "skills", s.id)).sort();
    for (const f of skillFiles) {
      try {
        const raw = readFileSync(f, "utf8");
        const { name, description } = parseFrontmatter(raw, f);
        const id = `${s.id}__${slug(name || basename(dirname(f)))}`;
        const cardPath = join(CARDS_DIR, `${id}.json`);
        const hash = hashContent(raw);
        const first = hashFirst.get(hash);
        if (first) {
          const kept = JSON.parse(readFileSync(first, "utf8")) as Card;
          const origin = originFor(s, f, name);
          if (!kept.origin.includes(origin)) { kept.origin.push(origin); writeFileSync(first, JSON.stringify(kept, null, 2) + "\n"); }
          deduped.push({ kept: kept.id, dropped: id });
          continue;
        }
        hashFirst.set(hash, cardPath);
        if (existsSync(cardPath)) {
          const prev = JSON.parse(readFileSync(cardPath, "utf8")) as Card;
          if (prev.hash === hash) {
            const junk = !prev.curated && (!prev.purpose || /^[>|][+-]?$/.test(prev.purpose.trim()) || (prev.use_when ?? []).every((u) => /^[>|][+-]?$/.test(u.trim())));
            total++; if (prev.goal && String(prev.goal).trim()) withGoal++;
            if (!junk) { cached++; continue; }
            const fresh = templateCard(id, s, f, name, description, raw, hash);
            fresh.tier = prev.tier; fresh.license = prev.license;
            if ((prev.verify ?? []).length) fresh.verify = prev.verify;
            if ((prev.origin ?? []).length) fresh.origin = prev.origin;
            writeFileSync(cardPath, JSON.stringify(fresh, null, 2) + "\n");
            made++; withGoal++;
            continue;
          }
          if (prev.curated) { total++; if (prev.goal && String(prev.goal).trim()) withGoal++; stale.push(`${id} (curated text kept, upstream changed)`); continue; }
        }
        const card = templateCard(id, s, f, name, description, raw, hash);
        writeFileSync(cardPath, JSON.stringify(card, null, 2) + "\n");
        made++; total++; withGoal++;
      } catch (e) { errors.push(`${f}: ${(e as Error).message}`); }
    }
  }
  return { made, cached, deduped, stale, errors, goalCoverage: { withGoal, total } };
}
function findSkillFiles(provider: string, base: string): string[] {
  void provider;
  const out: string[] = [];
  const walk = (d: string, depth: number) => {
    if (depth > 4 || !existsSync(d)) return;
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith(".") && e.name !== ".claude") continue;
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p, depth + 1);
      else if (e.name === "SKILL.md") out.push(p);
    }
  };
  walk(base, 0);
  return out;
}
export function parseFrontmatter(raw: string, f: string): { name: string; description: string } {
  const normalized = raw.replace(/\r\n/g, "\n");
  const m = normalized.match(/^---\s*\n([\s\S]*?)\n---/);
  let name = "", description = "";
  if (m) {
    try {
      const data = yaml.load(m[1]!) as Record<string, unknown> | null;
      if (data && typeof data === "object") {
        const n = data["name"], d = data["description"];
        if (typeof n === "string") name = n.trim(); else if (n != null) name = String(n).trim();
        if (typeof d === "string") description = d.trim(); else if (d != null) description = String(d).trim();
      }
    } catch {
      const nm = m[1]!.match(/^name:\s*(.+)$/m), dm = m[1]!.match(/^description:\s*(.+)$/m);
      if (nm) name = nm[1]!.trim();
      if (dm) description = dm[1]!.trim();
      if (/^[>|][+-]?$/.test(description)) description = "";
    }
  }
  if (!name) name = basename(dirname(f));
  if (!description) {
    const first = normalized.replace(/^---[\s\S]*?---/, "").trim().split("\n").map((l) => l.trim().replace(/^>\s*/, "")).find((l) => l.length > 20 && !/^[#\-*`!|]/.test(l) && !/^\d+[.)]/.test(l) && !/^>/.test(l));
    description = (first ?? `Skill ${name}`).slice(0, 200);
  }
  return { name, description };
}
function findPinnedSha(f: string): string {
  let d = dirname(f);
  for (let i = 0; i < 6; i++) {
    try { const s = readFileSync(join(d, ".pinned_sha"), "utf8").trim(); if (s) return s; } catch { /* up */ }
    const parent = dirname(d); if (parent === d) break; d = parent;
  }
  try { return execSync("git rev-parse HEAD", { cwd: dirname(f), encoding: "utf8", timeout: 5000 }).trim(); } catch { return "unpinned"; }
}
function originFor(s: { id: string; repo: string | null }, f: string, name: string): string {
  if (!s.repo) return `local@${name}`;
  return `${s.repo}@${findPinnedSha(f) || "unpinned"}`;
}
// Offline goal derivation (Card v2). Deterministic, no LLM: fills goal,
// when_to_use, when_not_to_use, provides, example, counter_example from raw
// SKILL.md text. Never overwrites curated cards; callers guard that.
export function deriveGoals(raw: string, card: { purpose?: string; use_when?: string[]; do_not_use_when?: string[]; id?: string }): { goal: string; when_to_use: string[]; when_not_to_use: string[]; provides: string[]; example: string; counter_example: string } {
  const body = raw.replace(/^---[\s\S]*?---/, "").trim();
  const desc = String(card.purpose ?? "").trim();
  let goal = "";
  for (const s of body.split(/(?<=[.!?])\s+/)) {
    const t = s.trim().replace(/\s+/g, " ");
    if (t.length < 40 || t.length > 200 || /^(#+|-|\*)/.test(t)) continue;
    if (/\b(helps?|creates?|builds?|outcomes?|delivers?|enables?|allows?|provides?|generates?|produces?|turns?)\b/i.test(t)) { goal = t.slice(0, 200); break; }
  }
  if (!goal) goal = (desc || `Skill ${card.id ?? "skill"}`).slice(0, 200);
  const mined = mineUseWhen(body, desc);
  const when_to_use = [...new Set([...(card.use_when ?? []), ...mined])].filter(Boolean).slice(0, 5);
  const wnu: string[] = [];
  for (const line of body.split("\n")) {
    if (wnu.length >= 5) break;
    if (!/do not use|not for|instead use|use .* instead/i.test(line)) continue;
    const t = line.replace(/^[\s>#\-*`|]+/, "").trim().slice(0, 160);
    if (t.length >= 15 && !wnu.some((o) => o.slice(0, 40) === t.slice(0, 40))) wnu.push(t);
  }
  if (!wnu.length) wnu.push(...(card.do_not_use_when ?? []));
  const heads = body.split("\n").filter((l) => /^##\s+/.test(l)).map((l) => l.replace(/^##\s+/, "").trim().slice(0, 80)).filter((s) => s.length >= 4);
  let provides = heads.slice(0, 3);
  if (!provides.length) provides = extractKeywords(raw, desc).slice(0, 3);
  if (!provides.length) provides = [(card.id ?? "").split("__")[1]?.replace(/-/g, " ") ?? "skill core"];
  const exLine = body.split("\n").find((l) => /^\s*-?\s*Example\s*:/i.test(l));
  const example = exLine ? exLine.replace(/^[\s>#\-*`|]+/, "").trim().slice(0, 200) : when_to_use.length ? `Example: ${when_to_use[0]!.slice(0, 100)}` : "";
  const ceLine = body.split("\n").find((l) => /(Not example|Avoid)\s*:/i.test(l));
  const counter_example = ceLine ? ceLine.replace(/^[\s>#\-*`|]+/, "").trim().slice(0, 200) : wnu.length ? `Not example: ${wnu[0]!.slice(0, 120)}` : "";
  return { goal: goal.slice(0, 200), when_to_use, when_not_to_use: wnu.slice(0, 5), provides: provides.slice(0, 3), example: example.slice(0, 200), counter_example: counter_example.slice(0, 200) };
}
export function summarizeCard(raw: string, card: Partial<Card>): Partial<Card> {
  return { ...(card as Card), ...deriveGoals(raw, card as Card) } as Partial<Card>;
}
export function templateCard(id: string, s: { id: string; repo: string | null }, f: string, name: string, desc: string, raw: string, hash: string): Card {
  void shaFile;
  const body = raw.replace(/^---[\s\S]*?---/, "").trim();
  const domain = resolveDomain({ id, curated: false }, f + " " + desc);
  const mined = mineUseWhen(body, desc);
  const keywords = extractKeywords(raw, [desc, ...mined].join(" "));
  const base: Card = {
    id, tier: "B", origin: [originFor(s, f, name)], license: "UNKNOWN", hash,
    purpose: desc.slice(0, 200), domain, task_types: guessTaskTypes(desc + " " + body.slice(0, 2000)),
    use_when: mined, do_not_use_when: [`Tasks unrelated to ${domain}`], scope: "Only touch files the task names; everything else read-only.",
    disambiguator: "", cluster: domain, cluster_role: "primary", pick_over_primary_when: null, pairs_with: null,
    requires: {}, conflicts_with: [], body_tokens: Math.ceil(raw.length / 4), core_bytes: Buffer.byteLength(raw),
    sections: extractSections(raw), keywords, verify: [], skill_path: f, curated: false,
  };
  const g = deriveGoals(raw, base);
  return { ...base, goal: g.goal, when_to_use: g.when_to_use, when_not_to_use: g.when_not_to_use, provides: g.provides, example: g.example, counter_example: g.counter_example };
}
