import { Hono } from "hono";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { STATE, safePath, ROOT } from "../adapter/repo.ts";
import { run } from "../adapter/exec.ts";
import { createPlan } from "../core/plan.ts";
import { applyPlan } from "../core/apply.ts";
import { findCard } from "../adapter/skills.ts";

export const ingestRoute = new Hono();
const TMP = join(STATE, "tmp");
mkdirSync(TMP, { recursive: true });

type SkillPreview = {
  id: string;
  path: string;
  license: string;
  bytes: number;
  duplicate_of: string | null;
  collision: boolean;
  valid: boolean;
};

ingestRoute.post("/preview", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const url = String(body.url ?? "").trim();
  const match = /^https:\/\/github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)(\.git)?$/.exec(url);
  if (!match) {
    return c.json({ error: "Only https://github.com/<owner>/<repo> URLs allowed" }, 400);
  }

  const cloneId = `ingest-${Date.now()}`;
  const targetDir = join(TMP, cloneId);
  rmSync(targetDir, { recursive: true, force: true });

  const r = await run("git", ["clone", "--depth", "1", url, targetDir], { timeout: 45_000 });
  if (r.code !== 0) {
    return c.json({ error: "Git clone failed", detail: r.stderr }, 502);
  }

  const found: SkillPreview[] = [];
  function scan(dir: string) {
    for (const f of readdirSync(dir)) {
      if (f === ".git" || f === "node_modules") continue;
      const p = join(dir, f);
      const st = statSync(p);
      if (st.isDirectory()) {
        scan(p);
      } else if (f.toLowerCase() === "skill.md") {
        const content = readFileSync(p, "utf8");
        const idMatch = /^name:\s*([a-zA-Z0-9_-]+)/m.exec(content);
        const name = idMatch ? idMatch[1] : `imported-${found.length + 1}`;
        const finalId = `${match![1]}__${name}`;
        const hash = createHash("sha256").update(content).digest("hex");
        const existing = findCard(finalId);

        found.push({
          id: finalId,
          path: p,
          license: "UNKNOWN",
          bytes: st.size,
          duplicate_of: existing && existing.hash === hash ? existing.id : null,
          collision: !!existing && existing.hash !== hash,
          valid: content.includes("---"),
        });
      }
    }
  }

  scan(targetDir);
  return c.json({ clone_id: cloneId, url, count: found.length, skills: found });
});

ingestRoute.post("/commit", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { clone_id, selected_skills } = body;
  if (!Array.isArray(selected_skills) || !selected_skills.length) {
    return c.json({ error: "selected_skills required" }, 400);
  }

  const mutations: { op: "write"; file: string; content: string }[] = [];
  const ids: string[] = [];

  for (const s of selected_skills) {
    if (!s.id || !s.path || !existsSync(s.path)) continue;
    const content = readFileSync(s.path, "utf8");
    const hash = createHash("sha256").update(content).digest("hex");

    const card = {
      id: s.id,
      tier: "C", // Ingest always defaults to Tier C
      origin: [`github@${clone_id}`],
      license: s.license || "UNKNOWN",
      hash,
      purpose: `Imported skill ${s.id}`,
      domain: "general",
      task_types: ["workflow"],
      use_when: [`Use ${s.id} when relevant`],
      do_not_use_when: ["Out of domain tasks"],
      scope: "Only touch files the task names.",
      cluster: "ingest",
      cluster_role: "primary",
      core_bytes: s.bytes,
      skill_path: s.path,
    };

    ids.push(s.id);
    mutations.push({
      op: "write",
      file: `cards/${s.id}.json`,
      content: JSON.stringify(card, null, 2) + "\n",
    });
  }

  const plan = createPlan("ingest.commit", ids, mutations);
  const result = await applyPlan(plan.plan_id);
  return c.json(result);
});
