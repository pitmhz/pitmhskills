import { Hono } from "hono";
import { z } from "zod";
import { recentChanges } from "../core/changes.ts";
import { listTrash, purgeTrash, restoreBackup } from "../core/trash.ts";
import { runCmd, CMD } from "../adapter/exec.ts";
import { ROOT } from "../adapter/repo.ts";

export const changesRoute = new Hono();
export const trashRoute = new Hono();

changesRoute.get("/", (c) => {
  const id = c.req.query("id");
  const limit = Math.min(100, Number(c.req.query("limit")) || 50);
  return c.json({ changes: recentChanges(limit, id) });
});

trashRoute.get("/", (c) => {
  return c.json({ backups: listTrash() });
});

trashRoute.post("/:ts/restore", async (c) => {
  const ts = c.req.param("ts");
  try {
    const restored = restoreBackup(ts);
    // Re-index after restore
    await runCmd(CMD.rebuild(), ROOT);
    return c.json({ ok: true, timestamp: ts, restored });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }
});

trashRoute.post("/purge", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  purgeTrash(body.timestamp);
  return c.json({ ok: true });
});
