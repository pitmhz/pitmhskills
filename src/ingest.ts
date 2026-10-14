import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import yaml from "js-yaml";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

interface Source { id: string; repo: string | null; ref: string; glob: string; path?: string; license_allow: string[] }

// sources.yaml loader on js-yaml. Supports comments, quoted strings,
// block/inline lists, and null repo for local sources.
export function loadSources(): Source[] {
  const raw = readFileSync(join(ROOT, "sources.yaml"), "utf8");
  const data = yaml.load(raw) as { sources?: Record<string, unknown>[] } | null;
  if (!data || !Array.isArray(data.sources)) return [];
  return data.sources.map(toSource);
}

function toSource(c: Record<string, unknown>): Source {
  const id = String(c["id"]);
  const repoRaw = c["repo"];
  const repo = repoRaw === null || repoRaw === undefined || repoRaw === "null" ? null : String(repoRaw);
  const globRaw = c["glob"] ?? "**/SKILL.md";
  const lic = c["license_allow"];
  return {
    id,
    repo,
    ref: c["ref"] != null ? String(c["ref"]) : "HEAD",
    glob: String(globRaw),
    path: c["path"] != null ? String(c["path"]) : undefined,
    license_allow: Array.isArray(lic) ? lic.map(String) : [],
  };
}

function skillsDir(): string { return join(ROOT, "skills"); }

export function ingest(opts: { bump?: string; provider?: string }): { fetched: number; skipped: string[] } {
  const sources = loadSources().filter((s) => !opts.provider || s.id === opts.provider);
  const skipped: string[] = [];
  let fetched = 0;
  mkdirSync(skillsDir(), { recursive: true });
  for (const s of sources) {
    if (!s.repo) {
      // local source: copy pointer only, cards built by `cards` cmd
      fetched += copyLocal(s);
      continue;
    }
    const dest = join(skillsDir(), s.id);
    try {
      if (!existsSync(join(dest, ".git"))) {
        mkdirSync(dest, { recursive: true });
        execSync(`git init -q`, { cwd: dest });
        execSync(`git remote add origin https://github.com/${s.repo}.git`, { cwd: dest });
      }
      const ref = s.ref === "HEAD" || opts.bump === s.id ? "HEAD" : s.ref;
      // shallow fetch of pinned ref
      execSync(`git fetch --depth 1 origin ${ref === "HEAD" ? "HEAD" : ref}`, { cwd: dest, timeout: 120000, stdio: ["ignore", "pipe", "pipe"] });
      try {
        execSync(`git checkout -q FETCH_HEAD -- .`, { cwd: dest, timeout: 60000, stdio: ["ignore", "pipe", "pipe"] });
      } catch {
        execSync(`git checkout -q FETCH_HEAD`, { cwd: dest, timeout: 60000, stdio: ["ignore", "pipe", "pipe"] });
      }
      try {
        const sha = execSync(`git rev-parse FETCH_HEAD`, { cwd: dest, encoding: "utf8", timeout: 10000 }).trim();
        writeFileSync(join(dest, ".pinned_sha"), sha + "\n");
      } catch { /* ignore */ }
      fetched++;
    } catch (e) {
      skipped.push(`${s.id}: ${(e as Error).message.slice(0, 200)}`);
    }
  }
  return { fetched, skipped };
}

function copyLocal(s: Source): number {
  // local skills live outside repo (../skills); nothing to fetch
  const p = s.path ? join(ROOT, s.path) : "";
  if (p && existsSync(p)) {
    const n = readdirSync(p).filter((f) => existsSync(join(p, f, "SKILL.md"))).length;
    return n;
  }
  return 0;
}

export function hashContent(b: string | Buffer): string {
  return createHash("sha256").update(b).digest("hex");
}

void basename;
