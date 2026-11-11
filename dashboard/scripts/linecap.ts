import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// Line caps (PRD 1): <= 200 lines per file, <= 3,600 source lines total, <= 12 runtime deps, <= 250 KB gz initial JS.
import { gzipSync } from "node:zlib";

const DASH = join(import.meta.dirname, "..");
const SRC = ["server", "web/src", "scripts"].map((d) => join(DASH, d));
let total = 0, bad = 0;
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => {
  const p = join(d, f);
  return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx|css)$/.test(f) ? [p] : [];
});
for (const f of SRC.flatMap(walk)) {
  const n = readFileSync(f, "utf8").split("\n").length;
  total += n;
  if (n > 200) { console.log(`FAIL ${relative(DASH, f)} ${n} lines > 200`); bad++; }
}
console.log(`${total <= 3600 ? "ok  " : "FAIL"} source lines ${total} / 3600`);
if (total > 3600) bad++;

const deps = Object.keys(JSON.parse(readFileSync(join(DASH, "package.json"), "utf8")).dependencies ?? {}).length;
console.log(`${deps <= 12 ? "ok  " : "FAIL"} runtime deps ${deps} / 12`);
if (deps > 12) bad++;

const assets = join(DASH, "web", "dist", "assets");
const js = readdirSync(assets).filter((f) => f.endsWith(".js")).reduce((s, f) => s + gzipSync(readFileSync(join(assets, f))).length, 0);
console.log(`${js <= 250 * 1024 ? "ok  " : "FAIL"} initial JS ${(js / 1024).toFixed(1)} KB gz / 250 KB`);
if (js > 250 * 1024) bad++;
process.exit(bad ? 1 : 0);
