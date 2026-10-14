import { existsSync, readFileSync, readdirSync } from "node:fs";
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
    ["firebase.json", "firebase"],
    ["pubspec.yaml", "flutter"],
    ["Gemfile", "ruby"],
    ["pom.xml", "java"], ["build.gradle", "android"], ["build.gradle.kts", "android"],
    ["composer.json", "php"],
    ["mix.exs", "elixir"],
    ["deno.json", "deno"], ["deno.jsonc", "deno"],
    ["vite.config.ts", "vite"], ["vite.config.js", "vite"], ["vite.config.mjs", "vite"],
    ["tailwind.config.js", "tailwind"], ["tailwind.config.ts", "tailwind"],
    ["app.json", "expo"], ["app.config.ts", "expo"], ["eas.json", "expo"],
  ];
  for (const [f, s] of checks) if (has(f)) { files.add(f); stack.add(s); }
  // glob-style markers that has() cannot express
  try {
    for (const e of readdirSync(cwd)) {
      if (e.endsWith(".csproj")) { stack.add("dotnet"); files.add(e); break; }
    }
  } catch { /* ignore */ }
  if (has(join(".github", "workflows"))) { files.add(".github/workflows"); stack.add("github-actions"); }
  if (has("package.json")) {
    try {
      const pkg = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8"));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps["next"]) stack.add("nextjs").add("react");
      if (deps["react"]) stack.add("react");
      if (deps["@cloudflare/workers-types"] || deps["wrangler"]) stack.add("cloudflare");
      if (deps["@supabase/supabase-js"]) stack.add("supabase");
      if (deps["gsap"]) stack.add("gsap");
      if (deps["firebase"] || deps["firebase-admin"]) stack.add("firebase");
      if (deps["tailwindcss"]) stack.add("tailwind");
      if (deps["prisma"] || deps["@prisma/client"]) stack.add("prisma");
      if (deps["drizzle-orm"]) stack.add("drizzle");
      if (deps["expo"]) stack.add("expo");
      if (deps["svelte"]) stack.add("svelte");
      if (deps["vue"]) stack.add("vue");
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
