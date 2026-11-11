import { Hono } from "hono";
import { z } from "zod";
import { appendCase, allCases } from "../adapter/eval.ts";
import { findCard } from "../adapter/skills.ts";
import { repoRel } from "../adapter/repo.ts";
import { logChange } from "../core/changes.ts";

export const evals = new Hono();

evals.get("/cases", (c) => c.json(allCases().map(({ file, ...r }) => ({ ...r, file: repoRel(file) }))));

// Append-only, no post-step (PRD 3.4 exception). `expect` is a known skill id or NONE.
evals.post("/cases", async (c) => {
  const p = z.object({
    task: z.string().trim().min(2).max(500).refine((s) => !/[\r\n]/.test(s), "single line"),
    expect: z.string().trim().regex(/^(NONE|[\w.-]+)$/),
    split: z.enum(["train", "heldout"]).default("train"),
  }).safeParse(await c.req.json().catch(() => null));
  if (!p.success) return c.json({ error: "invalid case", next: "Use a one-line task and a skill id or NONE." }, 400);
  if (p.data.expect !== "NONE" && !findCard(p.data.expect)) {
    return c.json({ error: `unknown skill id: ${p.data.expect}`, next: "Pick an id from the candidates or NONE." }, 400);
  }
  const r = appendCase(p.data.task, p.data.expect, p.data.split);
  const file = repoRel(r.file);
  logChange({ op: "eval.append", ids: p.data.expect === "NONE" ? [] : [p.data.expect], files: [file], note: p.data.task });
  return c.json({ ...r, file });
});
