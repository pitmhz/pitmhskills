import { Hono } from "hono";
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import { z } from "zod";
import { STATE, readJson } from "../adapter/repo.ts";
import { routeTask } from "../adapter/router.ts";
import { flags } from "../adapter/caps.ts";

export const route = new Hono();
const HISTORY = join(STATE, "history.json");
type Entry = { task: string; outcome: string; top: string | null; at: string };

route.post("/", async (c) => {
  if (!flags().HAS_ROUTER) return c.json({ blocked_by: "HAS_ROUTER" }, 501);
  const p = z.object({ task: z.string().trim().min(2).max(2000) }).safeParse(await c.req.json().catch(() => null));
  if (!p.success) return c.json({ error: "task is required", next: "Type a task of 2 to 2000 characters." }, 400);
  try {
    const r = await routeTask(p.data.task);
    const hist = readJson<Entry[]>(HISTORY, []);
    hist.unshift({ task: p.data.task, outcome: r.outcome, top: r.picks[0]?.id ?? null, at: new Date().toISOString() });
    writeFileSync(HISTORY, JSON.stringify(hist.slice(0, 20), null, 2));
    return c.json(r);
  } catch (e) {
    const err = e as Error & { detail?: string };
    return c.json({ error: err.message, why: "The router process failed or printed non-JSON.", next: "Run the command in a terminal to see the full output.", detail: err.detail }, 502);
  }
});

route.get("/history", (c) => c.json(readJson<Entry[]>(HISTORY, [])));
