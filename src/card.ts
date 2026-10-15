import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import yaml from "js-yaml";
import { hashContent, loadSources } from "./ingest.ts";
import { shaFile } from "./index.ts";
import { slug, guessDomain, guessTaskTypes, mineUseWhen, extractKeywords, extractSections } from "./cardtext.ts";
import type { Card } from "./types.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CARDS_DIR = join(ROOT, "cards");

// Build/refresh cards from raw skills. Offline template first; LLM upgrade fills
// use_when/do_not_use_when/disambiguator better. Cached by hash.
// Curated cards (curated:true) are NEVER overwritten: hash match -> cached,
// hash drift -> reported as stale for human re-review (checkCards flags them).
export function buildCards(opts: { check?: boolean; provider?: string }): { made: number; cached: number; deduped: { kept: string; dropped: string }[]; stale: string[]; errors: string[] } {
  mkdirSync(CARDS_DIR, { recursive: true });
  const sources = loadSources().filter((s) => !opts.provider || s.id === opts.provider);
  let made = 0, cached = 0;
  const deduped: { kept: string; dropped: string }[] = [];
  const stale: string[] = [];
  const errors: string[] = [];
  const hashFirst = new Map<string, string>(); // content hash -> kept card file (first wins)
  // Per-file cards (cached by hash, self-heal junk, fold duplicates).
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
          if (prev.hash === hash) {
            const junk = !prev.curated && (!prev.purpose || /^[>|][+-]?$/.test(prev.purpose.trim()) || (prev.use_when ?? []).every((u) => /^[>|][+-]?$/.test(u.trim())));
            if (!junk) { cached++; continue; }
            // Self-heal: text fields were compiled by a parser version that lost
            // folded YAML descriptions (purpose ">"). Rebuild text from source;
            // preserve curated fields (tier/license/origin/verify).
            const fresh = templateCard(id, s, f, name, description, raw, hash);
            fresh.tier = prev.tier;
            fresh.license = prev.license;
            if ((prev.verify ?? []).length) fresh.verify = prev.verify;
            if ((prev.origin ?? []).length) fresh.origin = prev.origin;
            writeFileSync(cardPath, JSON.stringify(fresh, null, 2) + "\n");
            made++;
            continue;
          }
          // Curated cards are never overwritten by templates. Upstream drift is
          // reported (return.stale + checkCards) for human re-review instead.
          if (prev.curated) { stale.push(`${id} (curated text kept, upstream changed)`); continue; }
        }
        const card = templateCard(id, s, f, name, description, raw, hash);
        writeFileSync(cardPath, JSON.stringify(card, null, 2) + "\n");
        made++;
      } catch (e) {
        errors.push(`${f}: ${(e as Error).message}`);
      }
    }
  }
  return { made, cached, deduped, stale, errors };
}

function findSkillFiles(provider: string, base: string): string[] {
  void provider;
  const out: string[] = [];
  const walk = (d: string, depth: number) => {
    if (depth > 4 || !existsSync(d)) return;
    for (const e of readdirSync(d, { withFileTypes: true })) {
      // Skip hidden/vendor dirs (.git, .openclaw client copies, node_modules):
      // repos often ship the same skill once per client adapter; the canonical
      // copy wins and duplicate ids stop churning the card.
      // Exception: .claude/skills is a canonical skill home (e.g.
      // microsoft/playwright-cli .claude/skills/dev), not a client copy.
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
        const n = data["name"];
        const d = data["description"];
        if (typeof n === "string") name = n.trim();
        else if (n != null) name = String(n).trim();
        if (typeof d === "string") description = d.trim();
        else if (d != null) description = String(d).trim();
      }
    } catch {
      // Invalid YAML (e.g. unquoted colon+space in a plain scalar, common in
      // SKILL.md descriptions): fall back to legacy single-line capture so we
      // never lose a description the old parser recovered. A bare YAML block
      // scalar marker (>, >-, |) captures as junk — drop it so the body
      // first-line fallback engages instead.
      const nm = m[1]!.match(/^name:\s*(.+)$/m);
      const dm = m[1]!.match(/^description:\s*(.+)$/m);
      if (nm) name = nm[1]!.trim();
      if (dm) description = dm[1]!.trim();
      if (/^[>|][+-]?$/.test(description)) description = "";
    }
  }
  if (!name) name = basename(dirname(f));
  if (!description) {
    const first = normalized
      .replace(/^---[\s\S]*?---/, "")
      .trim()
      .split("\n")
      .map((l) => l.trim().replace(/^>\s*/, ""))
      .find((l) => l.length > 20 && !/^[#\-*`!|]/.test(l) && !/^\d+[.)]/.test(l) && !/^>/.test(l));
    description = (first ?? `Skill ${name}`).slice(0, 200);
  }
  return { name, description };
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
export function templateCard(id: string, s: { id: string; repo: string | null }, f: string, name: string, desc: string, raw: string, hash: string): Card {
  void shaFile;
  const body = raw.replace(/^---[\s\S]*?---/, "").trim();
  const domain = guessDomain(f + " " + desc);
  const mined = mineUseWhen(body, desc);
  const keywords = extractKeywords(raw, [desc, ...mined].join(" "));
  return {
    id,
    tier: "B",
    origin: [originFor(s, f, name)],
    license: "UNKNOWN",
    hash,
    purpose: desc.slice(0, 200),
    domain,
    task_types: guessTaskTypes(desc + " " + body.slice(0, 2000)),
    use_when: mined,
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
    sections: extractSections(raw),
    keywords,
    verify: [],
    skill_path: f,
    curated: false,
  };
}
