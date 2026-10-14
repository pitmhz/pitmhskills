import { appendFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname, basename, isAbsolute, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { ingest, loadSources } from "./ingest.ts";
import { buildCards } from "./card.ts";
import { buildIndex } from "./index.ts";
import { route } from "./route.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const ADD_USAGE = "usage: bun src/cli.ts add <owner/repo[@skill]|local-path> [--skill name]";

export function parseAddSpec(spec: string): { repo: string | null; skill?: string; localPath?: string } {
  const s = (spec ?? "").trim();
  if (!s) throw new Error(ADD_USAGE);
  if (s.startsWith("./") || s.startsWith("../") || s.startsWith(".\\") || s.startsWith("/") || /^[A-Za-z]:[\\/]/.test(s) || s.includes("\\")) {
    return { repo: null, localPath: s };
  }
  const m = s.match(/^([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)(?:@([A-Za-z0-9_.-]+))?$/);
  if (m) return m[2] ? { repo: m[1]!, skill: m[2] } : { repo: m[1]! };
  throw new Error(`${ADD_USAGE} (got ${JSON.stringify(spec)})`);
}

function baseId(name: string): string {
  const b = name.toLowerCase().replace(/[^a-z0-9-_]+/g, "-").replace(/^-+|-+$/g, "")
    .replace(/[-_](agent-)?skills$/, "").replace(/[-_]agent$/, "");
  return b || "skill";
}

function uniqId(base: string, fallback: string): string {
  const taken = new Set(loadSources().map((s) => s.id));
  let b = base === "skill" || base === "agent" ? fallback : base;
  if (!taken.has(b)) return b;
  const ob = `${fallback}-${b}`;
  if (!taken.has(ob)) return ob;
  let i = 2;
  while (taken.has(`${b}-${i}`)) i++;
  return `${b}-${i}`;
}

function relPath(p: string): string {
  if (isAbsolute(p)) return relative(ROOT, p) || basename(p);
  return p.replace(/^\.[\\/]/, "");
}

export function registerSource(id: string, repo: string | null, glob = "**/SKILL.md", license_allow: string[] = ["MIT", "Apache-2.0"], path?: string): string {
  if (loadSources().some((s) => s.id === id)) throw new Error(`${id} already registered — use ingest --bump`);
  const allow = `[${license_allow.map((l) => `"${l}"`).join(", ")}]`;
  const lines = repo === null
    ? [`  - id: ${id}`, `    repo: null`, `    ref: local`, `    path: ${path ?? "."}`, `    glob: "${glob}"`, `    license_allow: ${allow}`]
    : [`  - id: ${id}`, `    repo: ${repo}`, `    ref: HEAD`, `    glob: "${glob}"`, `    license_allow: ${allow}`];
  appendFileSync(join(ROOT, "sources.yaml"), lines.join("\n") + "\n");
  return id;
}

function pinRef(id: string, sha: string): void {
  const p = join(ROOT, "sources.yaml");
  const raw = readFileSync(p, "utf8").split("\n");
  const start = raw.findIndex((l) => l.match(new RegExp(`^\\s{2}-\\s+id:\\s+${id}\\s*$`)));
  if (start < 0) return;
  for (let i = start + 1; i < raw.length && !raw[i]!.match(/^\s{2}-\s+id:/); i++) {
    if (raw[i]!.match(/^\s{4}ref:\s+/)) { raw[i] = `    ref: ${sha}`; break; }
  }
  writeFileSync(p, raw.join("\n"));
}

function findSkills(base: string): string[] {
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
  return out.sort();
}

function skillName(f: string): string {
  try {
    const raw = readFileSync(f, "utf8");
    const m = raw.match(/^---\s*\n([\s\S]*?)\n---/);
    const nm = m?.[1]?.match(/^name:\s*(.+)$/m);
    if (nm) return nm[1]!.trim().replace(/["']/g, "");
  } catch { /* fall through */ }
  return basename(dirname(f));
}

function providerCards(id: string): { ids: string[]; unknown: number } {
  const dir = join(ROOT, "cards");
  const ids: string[] = [];
  let unknown = 0;
  if (!existsSync(dir)) return { ids, unknown };
  for (const f of readdirSync(dir).filter((x) => x.startsWith(`${id}__`) && x.endsWith(".json"))) {
    try {
      const c = JSON.parse(readFileSync(join(dir, f), "utf8"));
      ids.push(c.id ?? f);
      if ((c.license ?? "UNKNOWN") === "UNKNOWN") unknown++;
    } catch { /* ignore */ }
  }
  return { ids: ids.sort(), unknown };
}

export interface AddProbe { task: string; outcome: string; skill_id: string | null }
export interface AddResult { id: string; skills: string[]; sha: string; probes: AddProbe[]; golden: string[]; unknownLicenses: number; grilled: boolean }

export function runAdd(spec: string, cwd: string, opts: { skill?: string } = {}): AddResult {
  const parsed = parseAddSpec(spec);
  const wantSkill = parsed.skill ?? opts.skill;
  const id = parsed.repo
    ? uniqId(baseId(parsed.repo.split("/")[1]!), parsed.repo.split("/")[0]!.toLowerCase())
    : uniqId(baseId(basename(relPath(parsed.localPath!))), "local");
  if (parsed.repo) registerSource(id, parsed.repo);
  else registerSource(id, null, "*/SKILL.md", ["MIT", "Apache-2.0"], relPath(parsed.localPath!));
  console.log(`registered source id=${id}`);
  const ig = ingest({ provider: id });
  for (const s of ig.skipped) console.log(`skip: ${s}`);
  const bc = buildCards({ provider: id });
  console.log(`cards made=${bc.made} cached=${bc.cached} errors=${bc.errors.length}`);
  for (const e of bc.errors) console.log(`err: ${e}`);
  const base = parsed.repo ? join(ROOT, "skills", id) : join(ROOT, relPath(parsed.localPath!));
  const skills = findSkills(base).map(skillName);
  console.log(`found ${skills.length} skill(s) for ${id}`);
  let grilled = false;
  if (skills.length > 10 && !wantSkill) {
    grilled = true;
    console.log(`grill: ${skills.length} skills found — re-run with --skill <name> to scope to one:`);
    for (const n of skills) console.log(`  - ${n}`);
  } else if (wantSkill) {
    const hit = skills.find((n) => n.toLowerCase() === wantSkill.toLowerCase());
    console.log(hit ? `scoped to skill: ${hit}` : `note: --skill ${wantSkill} not in [${skills.join(", ")}]`);
  }
  let sha = "local";
  try {
    const pin = readFileSync(join(ROOT, "skills", id, ".pinned_sha"), "utf8").trim();
    if (pin) { sha = pin; pinRef(id, sha); console.log(`pinned ${id} ref=${sha}`); }
  } catch { /* local source or fetch failed: ref stays */ }
  const ix = buildIndex();
  console.log(`indexed cards=${ix.cards} errors=${ix.errors.length}`);
  const { ids: cardIds, unknown } = providerCards(id);
  if (unknown > 0) console.warn(`WARNING: ${unknown} card(s) for ${id} have UNKNOWN license — resolve before Tier-A use`);
  const probes: AddProbe[] = [
    `use ${id} skills for their documented purpose`,
    `list what ${id} covers`,
  ].map((task, i) => {
    try {
      const r = route(task, cwd, `add-${id}-${Date.now()}-${i}`);
      return { task, outcome: r.outcome, skill_id: r.skill_id };
    } catch (e) { return { task, outcome: `ERROR: ${(e as Error).message}`, skill_id: null }; }
  });
  for (const p of probes) console.log(`probe ${JSON.stringify(p.task)} -> ${p.outcome} ${p.skill_id ?? "NONE"}`);
  const first = cardIds[0] ?? `${id}__skill`;
  const golden = probes.map((p) => `- task: ${JSON.stringify(p.task)}\n  expect: ${first}`);
  console.log("suggested golden cases (PRINT only, not appended):");
  for (const g of golden) console.log(g);
  console.log(`added id=${id} skills=${skills.length} sha=${sha}`);
  return { id, skills, sha, probes, golden, unknownLicenses: unknown, grilled };
}

if (import.meta.main) {
  const t = (cond: boolean, msg: string) => { if (!cond) { console.error(`FAIL: ${msg}`); process.exit(1); } };
  t(parseAddSpec("owner/repo").repo === "owner/repo", "owner/repo");
  const w = parseAddSpec("owner/repo@myskill");
  t(w.repo === "owner/repo" && w.skill === "myskill", "repo@skill");
  t(parseAddSpec("./rel/path").localPath === "./rel/path", "dot-path");
  t(parseAddSpec("C:\\abs\\path").localPath === "C:\\abs\\path", "win-path");
  let threw = false;
  try { parseAddSpec("not a spec!!!"); } catch (e) { threw = /usage/.test((e as Error).message); }
  t(threw, "bad-input-throws-usage");
  console.log("PASS: parseAddSpec 5/5");
}
