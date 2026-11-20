// Audit report rendering.
// Pure functions over the audit document. No file access, no database, no
// model. The CLI entry lives in src/audit-report.ts.

export interface Finding {
  id: string;
  title: string;
  area: string;
  severity: "P0" | "P1" | "P2" | "P3";
  status: "open" | "fixed" | "accepted" | "reported";
  confidence: "confirmed" | "measured" | "reported";
  found_by: string;
  phase: number;
  impact: string;
  evidence?: { file: string; line: number; quote: string }[];
  measurement?: { metric: string; value: string; method: string };
  fix: { summary: string; files: string[]; sketch?: string };
}

export interface Metric {
  value: number;
  unit: string;
  n?: number;
  baseline?: number;
}

import { renderFindings, renderOpen, renderMetrics } from "./audit-views.ts";

export interface AuditDoc {
  schema_version: string;
  meta: Record<string, unknown>;
  legend: Record<string, Record<string, string>>;
  summary: Record<string, unknown>;
  metrics: Record<string, Record<string, Metric>>;
  findings: Finding[];
}

const SEV_ORDER = ["P0", "P1", "P2", "P3"] as const;

export function summarise(findings: Finding[]): Record<string, unknown> {
  const bySeverity: Record<string, number> = {};
  const byArea: Record<string, number> = {};
  const byStatus: Record<string, number> = { open: 0, fixed: 0, accepted: 0, reported: 0 };
  for (const f of findings) {
    bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1;
    byArea[f.area] = (byArea[f.area] ?? 0) + 1;
    byStatus[f.status] = (byStatus[f.status] ?? 0) + 1;
  }
  return {
    total: findings.length,
    open: byStatus.open ?? 0,
    fixed: byStatus.fixed ?? 0,
    accepted: byStatus.accepted ?? 0,
    reported: byStatus.reported ?? 0,
    by_severity: bySeverity,
    by_area: byArea,
  };
}

function sevRank(s: string): number {
  const i = SEV_ORDER.indexOf(s as (typeof SEV_ORDER)[number]);
  return i === -1 ? 99 : i;
}

export function sortFindings(list: Finding[]): Finding[] {
  return [...list].sort((a, b) => {
    const s = sevRank(a.severity) - sevRank(b.severity);
    if (s !== 0) return s;
    const st = a.status === b.status ? 0 : a.status === "open" ? -1 : b.status === "open" ? 1 : 0;
    if (st !== 0) return st;
    return a.id.localeCompare(b.id);
  });
}

function cell(s: string): string {
  return String(s ?? "").replace(/\|/g, "/").replace(/\n+/g, " ").trim();
}

export function table(head: string[], rows: string[][]): string {
  const head1 = `| ${head.join(" | ")} |`;
  const sep = `| ${head.map(() => "---").join(" | ")} |`;
  const body = rows.map((r) => `| ${r.map(cell).join(" | ")} |`);
  return [head1, sep, ...body].join("\n");
}

export function renderReadme(doc: AuditDoc): string {
  const sum = summarise(doc.findings);
  const legend = doc.legend ?? {};
  const lines = [
    "# Audit findings",
    "",
    "Generated from `docs/audit/findings.json`. Do not edit the markdown files by hand.",
    "Change the JSON, then run `bun src/audit-report.ts`.",
    "",
    "## Files",
    "",
    "| File | What it holds |",
    "| --- | --- |",
    "| `findings.json` | The source of truth. Every finding, its evidence, its measurement, and its fix. |",
    "| `findings.md` | Every finding, grouped by area, with evidence and fix sketch. |",
    "| `open-issues.md` | The work queue. Open P0 and P1 only, in fix order. |",
    "| `metrics.md` | Every measured number with its baseline. |",
    "| `findings.csv` | Flat table for a spreadsheet. |",
    "",
    "## Summary",
    "",
    `- Findings: ${sum.total}`,
    `- Open: ${sum.open}`,
    `- Fixed: ${sum.fixed}`,
    `- Accepted on purpose: ${sum.accepted}`,
    `- Reported but not reproduced: ${sum.reported}`,
    "",
    "## How to read",
    "",
    "Severity",
    "",
    table(["Level", "Meaning"], Object.entries(legend.severity ?? {}).map(([k, v]) => [k, v])),
    "",
    "Status",
    "",
    table(["Value", "Meaning"], Object.entries(legend.status ?? {}).map(([k, v]) => [k, v])),
    "",
    "Confidence",
    "",
    table(["Value", "Meaning"], Object.entries(legend.confidence ?? {}).map(([k, v]) => [k, v])),
    "",
    "## Rules for adding a finding",
    "",
    "1. One id per finding. The prefix is the area: `AUD-RTE` router, `AUD-DLV` delivery, `AUD-SCR` scoring, `AUD-CRD` cards, `AUD-CNC` council, `AUD-ANA` analytics, `AUD-EVL` eval, `AUD-ENF` enforcement, `AUD-TST` tests, `AUD-OPT` cleanup, `AUD-DEC` decisions, `AUD-BEN` benchmark, `AUD-INT` integration.",
    "2. Evidence needs a file and a line. A claim without a file reference is status `reported`, not `confirmed`.",
    "3. A fix needs the files it touches. The generator prints them in the work queue.",
    "4. Status `fixed` only after the check that proves it passes.",
    "",
    "## Check",
    "",
    "```",
    "bun src/audit-report.ts --check",
    "```",
    "",
    "Exit code 1 means a generated file is out of date.",
    "",
  ];
  return lines.join("\n");
}

export function renderCsv(doc: AuditDoc): string {
  const head = ["id", "severity", "status", "area", "confidence", "phase", "found_by", "title", "files", "measurement"];
  const rows = sortFindings(doc.findings).map((f) => [
    f.id,
    f.severity,
    f.status,
    f.area,
    f.confidence,
    String(f.phase),
    f.found_by,
    f.title,
    f.fix.files.join(";"),
    f.measurement ? `${f.measurement.metric}=${f.measurement.value}` : "",
  ]);
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [head.join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n") + "\n";
}

export function outputs(doc: AuditDoc): Record<string, string> {
  return {
    "README.md": renderReadme(doc),
    "findings.md": renderFindings(doc),
    "open-issues.md": renderOpen(doc),
    "metrics.md": renderMetrics(doc),
    "findings.csv": renderCsv(doc),
  };
}

export function syncSummary(doc: AuditDoc): AuditDoc {
  return { ...doc, summary: summarise(doc.findings) };
}
