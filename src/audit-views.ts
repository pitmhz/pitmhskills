// Audit views: the long markdown pages.
// Split from src/audit-render.ts to keep every file under the 200 line cap.
// Pure string building over the audit document.

import { sortFindings, table, type AuditDoc, type Finding, type Metric } from "./audit-render.ts";

function fmtMetric(m: Metric): string {
  const base = m.baseline !== undefined ? ` (baseline ${m.baseline})` : "";
  const n = m.n !== undefined ? ` n=${m.n}` : "";
  return `${m.value}${m.unit === "percent" ? "%" : ` ${m.unit}`}${n}${base}`;
}

export function renderFindings(doc: AuditDoc): string {
  const areas = [...new Set(doc.findings.map((f) => f.area))].sort();
  const open = doc.findings.filter((f) => f.status === "open").length;
  const fixed = doc.findings.filter((f) => f.status === "fixed").length;
  const accepted = doc.findings.filter((f) => f.status === "accepted").length;
  const reported = doc.findings.filter((f) => f.status === "reported").length;
  const lines = [
    "# Audit findings",
    "",
    "Generated from `docs/audit/findings.json`. Do not edit by hand.",
    "",
    `- Findings: ${doc.findings.length}`,
    `- Open ${open}, fixed ${fixed}, accepted ${accepted}, reported ${reported}`,
    "",
    "## Index",
    "",
    table(
      ["Id", "Severity", "Status", "Area", "Title"],
      sortFindings(doc.findings).map((f) => [f.id, f.severity, f.status, f.area, f.title]),
    ),
    "",
  ];
  for (const area of areas) {
    lines.push(`## ${area}`, "");
    for (const f of sortFindings(doc.findings.filter((x) => x.area === area))) {
      lines.push(...findingBlock(f));
    }
  }
  return lines.join("\n");
}

function findingBlock(f: Finding): string[] {
  const lines = [
    `### ${f.id} ${f.title}`,
    "",
    table(
      ["Severity", "Status", "Confidence", "Phase", "Found by"],
      [[f.severity, f.status, f.confidence, String(f.phase), f.found_by]],
    ),
    "",
    `Impact: ${f.impact}`,
    "",
  ];
  if (f.evidence?.length) {
    lines.push("Evidence", "");
    for (const e of f.evidence) {
      const where = e.line > 0 ? `${e.file}:${e.line}` : e.file;
      lines.push(`- ${where} - ${e.quote}`);
    }
    lines.push("");
  }
  if (f.measurement) {
    lines.push(`Measurement: ${f.measurement.metric} = ${f.measurement.value} (${f.measurement.method})`, "");
  }
  lines.push(`Fix: ${f.fix.summary}`, "");
  if (f.fix.files.length) lines.push(`Files: ${f.fix.files.join(", ")}`, "");
  if (f.fix.sketch) lines.push(`Sketch: ${f.fix.sketch}`, "");
  return lines;
}

export function renderOpen(doc: AuditDoc): string {
  const list = sortFindings(
    doc.findings.filter((f) => f.status === "open" && (f.severity === "P0" || f.severity === "P1" || f.status === "reported")),
  );
  const lines = [
    "# Open work queue",
    "",
    "Generated from `docs/audit/findings.json`. Do not edit by hand.",
    "",
    `Open items: ${list.length}`,
    "",
    table(
      ["Id", "Severity", "Area", "Title", "Phase", "Files"],
      list.map((f) => [f.id, f.severity, f.area, f.title, String(f.phase), f.fix.files.join(", ")]),
    ),
    "",
    "## Fix order",
    "",
  ];
  const byPhase = new Map<number, Finding[]>();
  for (const f of list) {
    const arr = byPhase.get(f.phase) ?? [];
    arr.push(f);
    byPhase.set(f.phase, arr);
  }
  for (const phase of [...byPhase.keys()].sort((a, b) => a - b)) {
    lines.push(`### Phase ${phase}`, "");
    for (const f of byPhase.get(phase)!) {
      lines.push(`- **${f.id}** ${f.title}`);
      lines.push(`  - Fix: ${f.fix.summary}`);
      if (f.fix.sketch) lines.push(`  - Sketch: ${f.fix.sketch}`);
      lines.push(`  - Files: ${f.fix.files.join(", ")}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

export function renderMetrics(doc: AuditDoc): string {
  const lines = [
    "# Measured metrics",
    "",
    "Generated from `docs/audit/findings.json`. Do not edit by hand.",
    "",
  ];
  for (const [group, metrics] of Object.entries(doc.metrics)) {
    lines.push(`## ${group}`, "");
    lines.push(
      table(
        ["Metric", "Value", "Baseline"],
        Object.entries(metrics).map(([k, m]) => [k, fmtMetric(m), m.baseline !== undefined ? String(m.baseline) : "-"]),
      ),
      "",
    );
  }
  return lines.join("\n");
}
