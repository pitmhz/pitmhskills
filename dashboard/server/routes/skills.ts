import { Hono } from "hono";
import { join } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { bodyOf, findCard, loadCards, toRow, validation } from "../adapter/skills.ts";
import type { Row } from "../adapter/skills.ts";
import { CARDS_DIR } from "../adapter/repo.ts";
import { createPlan } from "../core/plan.ts";
import { applyPlan } from "../core/apply.ts";

export const skills = new Hono();

const SORTABLE: (keyof Row)[] = ["id", "tier", "domain", "cluster", "bytes", "state", "license"];

skills.get("/", async (c) => {
  const q = c.req.query();
  const v = await validation();
  const needle = (q.q ?? "").toLowerCase().trim();
  let rows = loadCards().map((card) => toRow(card, v));
  if (q.slice && q.slice !== "All") rows = rows.filter((r) => r.domain === q.slice);
  if (q.tier && q.tier !== "All") rows = rows.filter((r) => r.tier === q.tier);
  if (q.provenance === "yes") rows = rows.filter((r) => r.provenance);
  if (q.provenance === "no") rows = rows.filter((r) => !r.provenance);
  if (q.stale === "1") rows = rows.filter((r) => r.state !== "ok");
  if (q.cluster) rows = rows.filter((r) => r.cluster === q.cluster);
  if (needle) rows = rows.filter((r) => r.id.toLowerCase().includes(needle) || r.purpose.toLowerCase().includes(needle));
  const key = SORTABLE.includes(q.sort as keyof Row) ? (q.sort as keyof Row) : "id";
  const dir = q.dir === "desc" ? -1 : 1;
  rows.sort((a, b) => (a[key] < b[key] ? -dir : a[key] > b[key] ? dir : 0));
  const size = Math.min(100, Math.max(10, Number(q.size) || 100));
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const page = Math.min(pages, Math.max(1, Number(q.page) || 1));
  return c.json({ rows: rows.slice((page - 1) * size, page * size), total: rows.length, page, pages, size });
});

skills.get("/:id", async (c) => {
  const card = findCard(c.req.param("id"));
  if (!card) return c.json({ error: "skill not found", next: "Check the id or reload the library." }, 404);
  const raw = c.req.query("raw") === "1";
  const body = bodyOf(card, raw ? 200 * 1024 : 4 * 1024);
  const v = await validation();
  return c.json({
    card,
    row: toRow(card, v),
    errors: v.bad.get(card.id) ?? [],
    sections: (card.sections ?? []).map((s) => ({ name: s.name, bytes: s.bytes })),
    body,
  });
});

skills.post("/:id/plan", async (c) => {
  const id = c.req.param("id");
  const card = findCard(id);
  if (!card) return c.json({ error: "skill not found" }, 404);

  const payload = await c.req.json().catch(() => ({}));
  const action = payload.action ?? "edit"; // edit, freeze, delete
  const cardFile = `cards/${id}.json`;

  if (action === "delete") {
    const plan = createPlan("skill.delete", [id], [{ op: "delete", file: cardFile }], ["Skill card will be moved to trash and removed from index"]);
    return c.json(plan);
  }

  // Edit or freeze
  const existingPath = join(CARDS_DIR, `${id}.json`);
  const rawCurrent = existsSync(existingPath) ? readFileSync(existingPath, "utf8") : "{}";
  const updatedCard = { ...JSON.parse(rawCurrent) };

  if (action === "freeze") {
    updatedCard.tier = updatedCard.tier === "C" ? "B" : "C";
  } else if (payload.fields && typeof payload.fields === "object") {
    for (const [k, val] of Object.entries(payload.fields)) {
      if (k !== "id") updatedCard[k] = val;
    }
  }

  const newContent = JSON.stringify(updatedCard, null, 2) + "\n";
  const plan = createPlan("skill.edit", [id], [{ op: "write", file: cardFile, content: newContent }]);
  return c.json(plan);
});

skills.post("/:id/apply", async (c) => {
  const payload = await c.req.json().catch(() => ({}));
  const plan_id = payload.plan_id;
  if (!plan_id) return c.json({ error: "plan_id required" }, 400);

  const res = await applyPlan(plan_id);
  return c.json(res);
});

skills.post("/bulk/plan", async (c) => {
  const payload = await c.req.json().catch(() => ({}));
  const { ids, action } = payload;
  if (!Array.isArray(ids) || !ids.length) return c.json({ error: "ids array required" }, 400);

  const mutations: { op: "write" | "delete"; file: string; content?: string }[] = [];
  for (const id of ids) {
    const cardFile = `cards/${id}.json`;
    if (action === "delete") {
      mutations.push({ op: "delete", file: cardFile });
    } else if (action === "freeze") {
      const existingPath = join(CARDS_DIR, `${id}.json`);
      if (existsSync(existingPath)) {
        const cur = JSON.parse(readFileSync(existingPath, "utf8"));
        cur.tier = "C";
        mutations.push({ op: "write", file: cardFile, content: JSON.stringify(cur, null, 2) + "\n" });
      }
    }
  }

  const plan = createPlan(`bulk.${action}`, ids, mutations as any);
  return c.json(plan);
});
