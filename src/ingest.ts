import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

interface Source { id: string; repo: string | null; ref: string; glob: string; path?: string; license_allow: string[] }

// Minimal YAML parse for sources.yaml (id/repo/ref/glob/path only). No dep.
export function loadSources(): Source[] {
  const raw = readFileSync(join(ROOT, "sources.yaml"), "utf8");
  const lines = raw.split("\n");
  const out: Source[] = [];
  let cur: Record<string, string> = {};
  for (const ln of lines) {
    const m = ln.match(/^\s{2}-\s+id:\s+(\S+)/);
    if (m) { if (cur["id"]) out.push(toSource(cur)); cur = { id: m[1]! }; continue; }
    const kv = ln.match(/^\s{4}(\w+):\s+(.*)$/);
    if (kv && cur["id"]) cur[kv[1]!] = stripComment(kv[2]!.trim());
  }
  if (cur["id"]) out.push(toSource(cur));
  return out;
}

function stripComment(v: string): string {
  const i = v.indexOf(" #");
  return (i >= 0 ? v.slice(0, i) : v).trim();
}

function toSource(c: Record<string, string>): Source {
  return { id: c["id"]!, repo: c["repo"] === "null" ? null : c["repo"]!, ref: c["ref"] ?? "HEAD", glob: (c["glob"] ?? "**/SKILL.md").replace(/"/g, ""), path: c["path"], license_allow: [] };
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
