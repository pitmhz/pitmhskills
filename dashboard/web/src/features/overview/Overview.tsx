import { ArrowRight, RefreshCw } from "lucide-react";
import { useApp } from "../../lib/ctx.tsx";
import { href } from "../../lib/route.ts";
import { budgetState, bytes, num, pct, time } from "../../lib/format.ts";
import type { Audit } from "../../lib/api.ts";
import { Page } from "../../shell.tsx";
import { Button, Panel, Spinner, Tip } from "../../ui/controls.tsx";
import { StatusMark, type Status } from "../../ui/chips.tsx";

type Tile = { label: string; value: string; target: string; s: Status; reason?: string; to?: string };

function tiles(a: Audit): Tile[] {
  const pt = a.per_task;
  const avgT = a.budget.avg_bytes_target ?? 12288;
  return [
    { label: "Skills", value: num(a.total), target: `A ${num(a.tiers.A ?? 0)} · B ${num(a.tiers.B ?? 0)} · C ${num(a.tiers.C ?? 0)}`, s: "na", to: href("library") },
    { label: "Returnable", value: num(a.returnable), target: "tier A and B enter the route pool", s: a.returnable_no_provenance ? "warn" : "ok", to: href("library", { tier: "B" }) },
    { label: "No provenance", value: num(a.no_provenance), target: "target 0 (origin and known license)", s: a.returnable_no_provenance ? "bad" : "ok", to: href("library", { provenance: "no" }) },
    { label: "Stale or invalid", value: num(a.stale + a.invalid), target: `target 0 · validator exit ${a.validator.code}`, s: a.invalid ? "bad" : a.stale ? "warn" : "ok", to: href("library", { stale: 1 }) },
    { label: "Always-on bytes", value: bytes(a.always_on.max), target: `target ${a.budget.always_on_target} B · cap ${num(a.budget.always_on_cap)} B`, s: budgetState(a.always_on.max, a.budget.always_on_target) === "ok" ? "ok" : a.always_on.max > a.budget.always_on_cap ? "bad" : "warn", to: href("mandate") },
    pt
      ? { label: "Avg bytes per task", value: bytes(pt.avg), target: `target ${bytes(avgT)} · max ${bytes(pt.max)}`, s: budgetState(pt.avg, avgT), to: href("playground") }
      : { label: "Avg bytes per task", value: "—", target: a.measuring ? "measuring 12 eval queries" : "no measurement", s: "na", reason: "Runs the first 12 golden.yaml queries through the router." },
  ];
}

/** Deterministic: the first true row wins (PRD 8.1). */
function nextAction(a: Audit, slice: string): { text: string; cta: string; to: string } {
  if (a.validator.code !== 0)
    return { text: `Validator failing: ${a.invalid} invalid and ${a.stale} stale card${a.stale + a.invalid === 1 ? "" : "s"}.`, cta: "Open failing cards", to: href("library", { stale: 1 }) };
  if (a.stale_a) return { text: `${a.stale_a} tier A cards are stale.`, cta: "Review stale tier A", to: href("library", { tier: "A", stale: 1 }) };
  if (a.returnable_no_provenance)
    return { text: `${num(a.returnable_no_provenance)} returnable skills have no known license or origin.`, cta: "Open in Library", to: href("library", { provenance: "no" }) };
  if (a.bench && a.bench.top1 < 0.8) return { text: `Eval top-1 is ${pct(a.bench.top1)}, target 80%.`, cta: "Open Eval", to: href("eval") };
  if (a.always_on.max > a.budget.always_on_target)
    return { text: `Mandate is ${num(a.always_on.max)} B, target ${a.budget.always_on_target} B.`, cta: "Edit mandate", to: href("mandate") };
  return { text: `All green for ${slice}. Mark stable.`, cta: "Open readiness", to: href("eval") };
}

export function Overview() {
  const { audit: a, slice, reloadAudit } = useApp();
  if (!a) return <Page title="Overview"><Spinner label="Reading cards and running the validator" /></Page>;
  const next = nextAction(a, slice);
  return (
    <Page
      title="Overview"
      meta={<>Recomputed from the repo · validator {time(a.validator.at)}</>}
      actions={<Button variant="ghost" onClick={reloadAudit}><RefreshCw aria-hidden /> Recheck</Button>}
    >
      <div className="@container">
        <div className="grid grid-cols-2 gap-3 @[720px]:grid-cols-3 @[1100px]:grid-cols-6">
          {tiles(a).map((t) => (
            <a key={t.label} href={t.to} className="flex flex-col gap-1 rounded-[8px] border border-line bg-surface p-4 hover:border-ink-2">
              <span className="flex items-center justify-between text-[12px] text-ink-2">
                {t.label} <StatusMark s={t.s} />
              </span>
              <span className="mono text-[22px] font-semibold leading-7">{t.value}</span>
              {t.reason ? <Tip label={t.reason}><span className="text-[12px] text-ink-2">{t.target}</span></Tip> : <span className="text-[12px] text-ink-2">{t.target}</span>}
            </a>
          ))}
        </div>
      </div>

      <section aria-label="Next action" className="flex items-center justify-between gap-4 rounded-[8px] border border-line bg-surface px-4 py-3 shadow-[inset_2px_0_0_var(--accent)]">
        <div>
          <p className="text-[12px] text-ink-2">Next action</p>
          <p className="text-[14px] font-medium">{next.text}</p>
        </div>
        <a href={next.to}><Button variant="primary" tabIndex={-1}>{next.cta} <ArrowRight aria-hidden /></Button></a>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Router behavior">
          <dl className="grid grid-cols-[1fr_auto] gap-y-2 text-[13px]">
            <dt className="text-ink-2">Skills loaded per task</dt>
            <dd className="mono text-right">{a.per_task ? a.per_task.skills.toFixed(2) : "—"} <span className="text-ink-2">/ max {a.budget.max_skills_per_task ?? "—"}</span></dd>
            <dt className="text-ink-2">Max bytes per task</dt>
            <dd className="mono text-right">{bytes(a.per_task?.max)} <span className="text-ink-2">/ cap {bytes(a.budget.max_bytes)}</span></dd>
            <dt className="text-ink-2">Abstention on out-of-domain queries</dt>
            <dd className="mono text-right">{a.abstention ? `${pct(a.abstention.rate)} of ${a.abstention.n}` : "—"}</dd>
            <dt className="text-ink-2">Measured</dt>
            <dd className="text-right">{a.measuring ? <Spinner label="routing sample queries" /> : <span className="mono">{time(a.per_task?.at)}</span>}</dd>
          </dl>
        </Panel>
        <Panel title="Last benchmark">
          {a.bench ? (
            <dl className="grid grid-cols-[1fr_auto] gap-y-2 text-[13px]">
              <dt className="text-ink-2">Top-1</dt><dd className="mono text-right">{pct(a.bench.top1)} <span className="text-ink-2">/ target 80%</span></dd>
              <dt className="text-ink-2">NONE precision</dt><dd className="mono text-right">{pct(a.bench.nonePrecision)}</dd>
              <dt className="text-ink-2">Cases</dt><dd className="mono text-right">{num(a.bench.n)}</dd>
              <dt className="text-ink-2">Run at</dt><dd className="mono text-right">{time(a.bench.at)}</dd>
            </dl>
          ) : (
            <p className="text-[13px] text-ink-2">No stored benchmark. Runs are started from Eval, never on page load.</p>
          )}
        </Panel>
      </div>
    </Page>
  );
}
