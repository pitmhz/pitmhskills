import { Hono } from "hono";
import { z } from "zod";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { MANDATE_FILE, CONFIG_FILE, readJson, safePath } from "../adapter/repo.ts";
import { agentFiles, budget, lintMandate, MANDATE_MODE } from "../adapter/mandate.ts";
import { createPlan } from "../core/plan.ts";
import { applyPlan } from "../core/apply.ts";

export const mandateRoute = new Hono();
export const configRoute = new Hono();

mandateRoute.get("/", (c) => {
  const text = readFileSync(MANDATE_FILE, "utf8");
  const b = budget();
  const lint = lintMandate(text);
  const targets = agentFiles();
  return c.json({
    mode: MANDATE_MODE,
    text,
    bytes: Buffer.byteLength(text),
    target_bytes: b.target,
    cap_bytes: b.cap,
    lint,
    targets,
    drift: targets.length > 1 ? targets.filter((t) => t.bytes !== Buffer.byteLength(text)).length : 0,
  });
});

mandateRoute.put("/", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const text = String(body.text ?? "");
  const syncTargets = Array.isArray(body.sync_targets) ? body.sync_targets : ["AGENTS.md"];

  const lint = lintMandate(text);
  const errors = lint.filter((l) => l.level === "error" && !l.ok);
  if (errors.length > 0) {
    return c.json({ error: "Lint check failed", why: errors.map((e) => e.rule).join("; ") }, 400);
  }

  const mutations = syncTargets.map((file: string) => ({
    op: "write" as const,
    file,
    content: text,
  }));

  const plan = createPlan("mandate.update", syncTargets, mutations);
  return c.json(plan);
});

mandateRoute.post("/apply", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const plan_id = String(body.plan_id ?? "");
  if (!plan_id) return c.json({ error: "plan_id required" }, 400);

  const res = await applyPlan(plan_id);
  return c.json(res);
});

configRoute.get("/", (c) => {
  const cfg = readJson<Record<string, unknown>>(CONFIG_FILE, {});
  return c.json({ config: cfg });
});

configRoute.put("/", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const current = readJson<Record<string, unknown>>(CONFIG_FILE, {});
  const allowed = ["floor", "margin", "pick_floor", "max_bytes", "avg_bytes_target", "max_skills_per_task"];
  const updated: Record<string, unknown> = { ...current };

  for (const k of allowed) {
    if (k in body && typeof body[k] === "number") {
      updated[k] = body[k];
    }
  }

  const content = JSON.stringify(updated, null, 2) + "\n";
  const plan = createPlan("config.update", ["config.json"], [{ op: "write", file: "config.json", content }]);
  return c.json(plan);
});
