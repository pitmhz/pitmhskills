import { Hono } from "hono";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { STATE } from "../adapter/repo.ts";
import { loadCards, hasProvenance } from "../adapter/skills.ts";
import { allCases } from "../adapter/eval.ts";

export const slicesRoute = new Hono();
const SLICES_FILE = join(STATE, "slices.json");

function getSlicesState(): Record<string, { stable: boolean; marked_at?: string }> {
  if (!existsSync(SLICES_FILE)) return {};
  try { return JSON.parse(readFileSync(SLICES_FILE, "utf8")); } catch { return {}; }
}

slicesRoute.get("/:slice/readiness", (c) => {
  const sliceName = c.req.param("slice");
  const cards = loadCards().filter((card) => sliceName === "All" || card.domain === sliceName);
  const cases = allCases();
  const state = getSlicesState();

  const total = cards.length;
  const missingCards = cards.filter((cd) => cd.tier === "A" && (!cd.use_when || (cd.use_when as string[]).length < 2)).length;
  const returnableNoProv = cards.filter((cd) => cd.tier !== "C" && !hasProvenance(cd)).length;
  const evalCount = cases.filter((cs) => cs.split === "heldout" || cs.split === "train").length;

  const criteria = [
    { label: "All returnable skills have complete cards", pass: missingCards === 0, count: `${missingCards} incomplete` },
    { label: "Provenance & licenses verified", pass: returnableNoProv === 0, count: `${returnableNoProv} unverified` },
    { label: "Benchmark evaluation set present (≥ 3 cases)", pass: evalCount >= 3, count: `${evalCount} cases` },
  ];

  const ready = criteria.every((cr) => cr.pass);
  const isStable = !!state[sliceName]?.stable;

  return c.json({ slice: sliceName, total, criteria, ready, isStable, marked_at: state[sliceName]?.marked_at });
});

slicesRoute.post("/:slice/stable", async (c) => {
  const sliceName = c.req.param("slice");
  const state = getSlicesState();
  const body = await c.req.json().catch(() => ({}));
  const setStable = body.stable !== false;

  state[sliceName] = { stable: setStable, marked_at: setStable ? new Date().toISOString() : undefined };
  writeFileSync(SLICES_FILE, JSON.stringify(state, null, 2) + "\n");
  return c.json({ ok: true, slice: sliceName, stable: setStable });
});
