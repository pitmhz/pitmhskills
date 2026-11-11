import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { DASH, STATE } from "./adapter/repo.ts";
import { capabilities } from "./adapter/caps.ts";
import { audit } from "./core/audit.ts";
import { skills } from "./routes/skills.ts";
import { route } from "./routes/route.ts";
import { evals } from "./routes/evals.ts";

const PORT = Number(process.env.PORT ?? 4317);
const HOST = "127.0.0.1";
const DIST = join(DASH, "web", "dist");
const TOKEN = randomBytes(24).toString("hex");
writeFileSync(join(STATE, "token"), TOKEN, { mode: 0o600 });

const allowed = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);
const app = new Hono();

// Same-origin only: reject foreign Host/Origin, require the write token on every non-GET.
app.use("*", async (c, next) => {
  const host = c.req.header("host") ?? "";
  const origin = c.req.header("origin");
  if (!allowed.has(host)) return c.text("forbidden host", 403);
  if (origin && !allowed.has(origin.replace(/^https?:\/\//, ""))) return c.text("forbidden origin", 403);
  if (c.req.method !== "GET" && c.req.method !== "HEAD" && c.req.header("x-dash-token") !== TOKEN) {
    return c.json({ error: "missing or wrong write token", next: "Reload the page." }, 403);
  }
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "no-referrer");
});
app.use("/api/*", bodyLimit({ maxSize: 1024 * 1024 }));

app.get("/api/capabilities", (c) => c.json(capabilities()));
app.get("/api/audit", async (c) => c.json(await audit(c.req.query("fresh") === "1")));
app.route("/api/skills", skills);
app.route("/api/route", route);
app.route("/api/eval", evals);
app.all("/api/*", (c) => c.json({ error: "unknown endpoint" }, 404));

const TYPES: Record<string, string> = {
  ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".html": "text/html",
};

function indexHtml(): string {
  const f = join(DIST, "index.html");
  if (!existsSync(f)) return "<p>Build missing. Run <code>npm run build</code> in dashboard/.</p>";
  return readFileSync(f, "utf8").replace("</head>", `<meta name="dash-token" content="${TOKEN}"></head>`);
}

app.get("*", (c) => {
  const rel = decodeURIComponent(new URL(c.req.url).pathname).replace(/^\/+/, "");
  const full = resolve(DIST, rel);
  if (rel && full.startsWith(DIST + sep) && existsSync(full) && !full.endsWith("index.html")) {
    c.header("Content-Type", TYPES[extname(full)] ?? "application/octet-stream");
    c.header("Cache-Control", "public, max-age=31536000, immutable");
    return c.body(readFileSync(full));
  }
  c.header("Cache-Control", "no-store");
  return c.html(indexHtml());
});

serve({ fetch: app.fetch, hostname: HOST, port: PORT }, () => {
  console.log(`pitmhskills dashboard on http://${HOST}:${PORT}`);
});
