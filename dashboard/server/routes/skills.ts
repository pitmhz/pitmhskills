import { Hono } from "hono";
import { bodyOf, findCard, loadCards, toRow, validation } from "../adapter/skills.ts";
import type { Row } from "../adapter/skills.ts";

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
