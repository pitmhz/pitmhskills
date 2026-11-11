import { Hono } from "hono";
import { loadCards } from "../adapter/skills.ts";
import { CMD, runCmd } from "../adapter/exec.ts";
import { ROOT } from "../adapter/repo.ts";
import { lastBench } from "../adapter/eval.ts";

export const clustersRoute = new Hono();
export const evalRoute = new Hono();

clustersRoute.get("/", (c) => {
  const cards = loadCards();
  const clustersMap = new Map<string, { cluster: string; primary: string | null; members: any[] }>();

  for (const card of cards) {
    const clName = card.cluster || "unclustered";
    const entry = clustersMap.get(clName) ?? { cluster: clName, primary: null, members: [] };
    if (card.cluster_role === "primary") entry.primary = card.id;
    entry.members.push({
      id: card.id,
      role: card.cluster_role || "variant",
      tier: card.tier,
      pick_over_primary_when: card.pick_over_primary_when,
    });
    clustersMap.set(clName, entry);
  }

  return c.json({ clusters: Array.from(clustersMap.values()) });
});

evalRoute.post("/run", async (c) => {
  const res = await runCmd(CMD.bench(), ROOT, 120_000);
  const bench = lastBench();
  return c.json({
    ok: res.code === 0,
    code: res.code,
    stdout: res.stdout.slice(0, 4000),
    bench,
  });
});
