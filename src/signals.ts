import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import type { Signals } from "./types.ts";

// Deterministic repo signals, no LLM. Inspects cwd only.
export function detectSignals(cwd: string): Signals {
  const stack = new Set<string>();
  const files = new Set<string>();
  const has = (p: string) => existsSync(join(cwd, p));
  const checks: [string, string][] = [
    ["package.json", "node"],
    ["next.config.js", "nextjs"], ["next.config.mjs", "nextjs"], ["next.config.ts", "nextjs"],
    ["wrangler.toml", "cloudflare"], ["wrangler.json", "cloudflare"],
    ["supabase/config.toml", "supabase"],
    ["src-tauri/tauri.conf.json", "tauri"],
    ["requirements.txt", "python"], ["pyproject.toml", "python"],
    ["Cargo.toml", "rust"], ["go.mod", "go"],
    ["wrangler", "workers"],
  ];
  for (const [f, s] of checks) if (has(f)) { files.add(f); stack.add(s); }
  if (has("package.json")) {
    try {
      const pkg = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8"));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps["next"]) stack.add("nextjs").add("react");
      if (deps["react"]) stack.add("react");
      if (deps["@cloudflare/workers-types"] || deps["wrangler"]) stack.add("cloudflare");
      if (deps["@supabase/supabase-js"]) stack.add("supabase");
      if (deps["gsap"]) stack.add("gsap");
      files.add("package.json");
    } catch { /* ignore */ }
  }
  try {
    let diff = "";
    try {
      diff = execSync("git diff --name-only HEAD", { cwd, encoding: "utf8", timeout: 3000, stdio: ["ignore", "pipe", "pipe"] }) as string;
    } catch {
      try {
        diff = execSync("git diff --name-only", { cwd, encoding: "utf8", timeout: 3000, stdio: ["ignore", "pipe", "pipe"] }) as string;
      } catch { diff = ""; }
    }
    for (const f of diff.split("\n").map((s: string) => s.trim()).filter(Boolean).slice(0, 50)) files.add(f);
  } catch { /* no git */ }
  return { stack: [...stack].sort(), files: [...files].sort() };
}
