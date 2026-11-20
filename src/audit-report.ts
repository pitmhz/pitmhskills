// Audit report CLI.
// One source of truth: docs/audit/findings.json. Every markdown file under
// docs/audit/ is generated from it, so the readable view can never drift from
// the data.
//
//   bun src/audit-report.ts           write every generated file
//   bun src/audit-report.ts --check   exit 1 when a generated file is stale
//
// Pure local work: reads JSON, renders strings, writes files. No network, no
// database, no model.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { outputs, syncSummary, type AuditDoc } from "./audit-render.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = join(ROOT, "docs", "audit");
const SRC = join(DIR, "findings.json");

export function loadDoc(): AuditDoc {
  return JSON.parse(readFileSync(SRC, "utf8")) as AuditDoc;
}

if (import.meta.main) {
  const check = process.argv.includes("--check");
  const doc = syncSummary(loadDoc());
  const files = outputs(doc);
  mkdirSync(DIR, { recursive: true });
  let stale = 0;
  for (const [name, content] of Object.entries(files)) {
    const path = join(DIR, name);
    const current = existsSync(path) ? readFileSync(path, "utf8") : "";
    if (current === content) continue;
    if (check) {
      console.log(`STALE: docs/audit/${name}`);
      stale++;
    } else {
      writeFileSync(path, content);
      console.log(`wrote docs/audit/${name}`);
    }
  }
  if (!check) {
    const withSummary = JSON.stringify(doc, null, 2) + "\n";
    if (readFileSync(SRC, "utf8") !== withSummary) {
      writeFileSync(SRC, withSummary);
      console.log("wrote docs/audit/findings.json (summary synced)");
    }
  }
  if (stale) {
    console.log(`${stale} file(s) out of date. Run: bun src/audit-report.ts`);
    process.exit(1);
  }
  if (check) console.log("audit report up to date");
}
