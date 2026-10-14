import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { hashContent, loadSources } from "./ingest.ts";
import { shaFile } from "./index.ts";
import type { Card } from "./types.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CARDS_DIR = join(ROOT, "cards");

// Build/refresh cards from raw skills. Offline template first; LLM upgrade fills
// use_when/do_not_use_when/disambiguator better. Cached by hash.
export function buildCards(opts: { check?: boolean; provider?: string }): { made: number; cached: number; deduped: { kept: string; dropped: string }[]; errors: string[] } {
  mkdirSync(CARDS_DIR, { recursive: true });
  const sources = loadSources().filter((s) => !opts.provider || s.id === opts.provider);
  let made = 0, cached = 0;
  const deduped: { kept: string; dropped: string }[] = [];
  const errors: string[] = [];
  const hashFirst = new Map<string, string>(); // content hash -> kept card file (first wins)
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
          // Duplicate content: fold origin into the kept card, skip the duplicate.
          const kept = JSON.parse(readFileSync(first, "utf8")) as Card;
          const origin = originFor(s, f, name);
          if (!kept.origin.includes(origin)) {
            kept.origin.push(origin);
            writeFileSync(first, JSON.stringify(kept, null, 2) + "\n");
          }
          deduped.push({ kept: kept.id, dropped: id });
          continue;
        }
        hashFirst.set(hash, cardPath);
        if (existsSync(cardPath)) {
          const prev = JSON.parse(readFileSync(cardPath, "utf8")) as Card;
          if (prev.hash === hash) { cached++; continue; }
        }
        const card = templateCard(id, s, f, name, description, raw, hash);
        writeFileSync(cardPath, JSON.stringify(card, null, 2) + "\n");
        made++;
      } catch (e) {
        errors.push(`${f}: ${(e as Error).message}`);
      }
    }
  }
  return { made, cached, deduped, errors };
}

function findSkillFiles(provider: string, base: string): string[] {
  void provider;
  const out: string[] = [];
  const walk = (d: string, depth: number) => {
    if (depth > 4 || !existsSync(d)) return;
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p, depth + 1);
      else if (e.name === "SKILL.md") out.push(p);
    }
  };
  walk(base, 0);
  return out;
}

function parseFrontmatter(raw: string, f: string): { name: string; description: string } {
  const m = raw.match(/^---\s*\n([\s\S]*?)\n---/);
  let name = "", description = "";
  if (m) {
    const nm = m[1]!.match(/^name:\s*(.+)$/m);
    const dm = m[1]!.match(/^description:\s*(.+)$/m);
    if (nm) name = nm[1]!.trim().replace(/["']/g, "");
    if (dm) description = dm[1]!.trim().replace(/["']/g, "");
  }
  if (!name) name = basename(dirname(f));
  if (!description) {
    const first = raw.replace(/^---[\s\S]*?---/, "").trim().split("\n").find((l) => l.trim().length > 20);
    description = (first ?? `Skill ${name}`).slice(0, 200);
  }
  return { name, description };
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "skill";
}

function findPinnedSha(f: string): string {
  let d = dirname(f);
  for (let i = 0; i < 6; i++) {
    try {
      const s = readFileSync(join(d, ".pinned_sha"), "utf8").trim();
      if (s) return s;
    } catch { /* up */ }
    const parent = dirname(d);
    if (parent === d) break;
    d = parent;
  }
  try {
    return execSync("git rev-parse HEAD", { cwd: dirname(f), encoding: "utf8", timeout: 5000 }).trim();
  } catch { return "unpinned"; }
}
function originFor(s: { id: string; repo: string | null }, f: string, name: string): string {
  if (!s.repo) return `local@${name}`;
  return `${s.repo}@${findPinnedSha(f) || "unpinned"}`;
}
function templateCard(id: string, s: { id: string; repo: string | null }, f: string, name: string, desc: string, raw: string, hash: string): Card {
  void shaFile;
  const body = raw.replace(/^---[\s\S]*?---/, "").trim();
  const domain = guessDomain(f + " " + desc);
  return {
    id,
    tier: "B",
    origin: [originFor(s, f, name)],
    license: "UNKNOWN",
    hash,
    purpose: desc.slice(0, 200),
    domain,
    task_types: guessTaskTypes(desc + " " + body.slice(0, 2000)),
    use_when: [desc.slice(0, 160)],
    do_not_use_when: [`Tasks unrelated to ${domain}`],
    scope: "Only touch files the task names; everything else read-only.",
    disambiguator: "",
    cluster: domain,
    cluster_role: "primary",
    pick_over_primary_when: null,
    pairs_with: null,
    requires: {},
    conflicts_with: [],
    body_tokens: Math.ceil(raw.length / 4),
    core_bytes: Buffer.byteLength(raw),
    sections: [],
    verify: [],
    skill_path: f,
  };
}

function guessDomain(t: string): string {
  const l = t.toLowerCase();
  if (/worker|cloudflare|edge|kv|d1|r2|waf/.test(l)) return "cloudflare-edge";
  if (/supabase|postgres|rls|sql/.test(l)) return "backend-data";
  if (/react|next|frontend|gsap|animat|ui\b|dashboard/.test(l)) return "frontend";
  if (/cuda|nvidia|nim|tensor|gpu/.test(l)) return "gpu-compute";
  if (/memory|cavemem|retriev|rag/.test(l)) return "memory";
  if (/grill|review|spec|ticket|triage/.test(l)) return "workflow";
  return "general";
}

function guessTaskTypes(t: string): string[] {
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
