import { existsSync, mkdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { run } from "./exec.ts";

// The only module that knows where the repo lives. Everything else asks here.
export const DASH = resolve(import.meta.dirname, "..", "..");
export const ROOT = resolve(DASH, "..");
export const STATE = join(DASH, ".state");
export const CARDS_DIR = join(ROOT, "cards");
export const CONFIG_FILE = join(ROOT, "config.json");
export const MANDATE_FILE = join(ROOT, "AGENTS.md");
export const EVAL_CASES = join(ROOT, "evals", "cases.jsonl");

for (const d of ["trash", "jobs", "cache", "tmp"]) mkdirSync(join(STATE, d), { recursive: true });

/** Resolve a repo-relative path and refuse anything that escapes the root. */
export function safePath(rel: string): string {
  if (!rel || isAbsolute(rel) || /^[a-zA-Z]:/.test(rel) || rel.split(/[\\/]/).includes("..")) {
    throw new Error(`path rejected: ${rel}`);
  }
  const full = resolve(ROOT, rel);
  if (full !== ROOT && !full.startsWith(ROOT + sep)) throw new Error(`path outside repo: ${rel}`);
  if (existsSync(full)) {
    const real = realpathSync(full);
    if (real !== ROOT && !real.startsWith(realpathSync(ROOT) + sep)) throw new Error(`symlink leaves repo: ${rel}`);
  }
  return full;
}

export const repoRel = (full: string) => relative(ROOT, full).split(sep).join("/");

export function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

export const mtime = (file: string) => (existsSync(file) ? statSync(file).mtimeMs : 0);
export const hasGit = () => existsSync(join(ROOT, ".git"));

/** Files with uncommitted changes, limited to the given repo-relative paths (or all). */
export async function dirtyFiles(paths?: string[]): Promise<string[]> {
  if (!hasGit()) return [];
  const r = await run("git", ["status", "--porcelain", "--", ...(paths ?? [])], { timeout: 15_000 });
  return r.stdout.split("\n").filter(Boolean).map((l) => l.slice(3).trim());
}

export const ensureDir = (file: string) => mkdirSync(dirname(file), { recursive: true });
