import { useState } from "react";
import { toast } from "sonner";
import { api, useApi } from "../../lib/api.ts";
import { pct } from "../../lib/format.ts";
import { Page } from "../../shell.tsx";
import { Button, Panel, Spinner } from "../../ui/controls.tsx";
import { useApp } from "../../lib/ctx.tsx";

export function EvalScreen() {
  const { slice } = useApp();
  const { data: casesData } = useApi<any[]>("/api/eval/cases");
  const { data: readinessData, reload: reloadReadiness } = useApi<any>(`/api/slices/${encodeURIComponent(slice)}/readiness`);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);

  const runEval = async () => {
    setRunning(true); setResult(null);
    try { setResult(await api.post<any>("/api/eval-run/run")); toast.success("Benchmark completed"); }
    catch (err: any) { toast.error(`Failed: ${err.message}`); } finally { setRunning(false); }
  };

  const toggleStable = async () => {
    if (!readinessData) return;
    try {
      await api.post(`/api/slices/${encodeURIComponent(slice)}/stable`, { stable: !readinessData.isStable });
      toast.success(readinessData.isStable ? `Unmarked ${slice}` : `Marked ${slice} Stable`);
      reloadReadiness();
    } catch (err: any) { toast.error(`Failed: ${err.message}`); }
  };

  const cases = casesData || [];
  return (
    <Page title="Evaluation & Readiness" meta={`Readiness and tests for: ${slice}`}
      actions={
        <div className="flex gap-2">
          {readinessData && <Button variant={readinessData.isStable ? "secondary" : "primary"} onClick={toggleStable}>{readinessData.isStable ? "Unmark Stable" : "Mark Stable"}</Button>}
          <Button variant="primary" onClick={runEval} disabled={running}>{running ? "Running..." : "Run Eval"}</Button>
        </div>
      }>
      {readinessData && (
        <Panel title={`Readiness: ${slice} ${readinessData.isStable ? "● STABLE" : ""}`}>
          <ul className="flex flex-col gap-1 text-xs">
            {readinessData.criteria.map((cr: any, i: number) => (
              <li key={i} className="flex justify-between">
                <span>{cr.pass ? "✓" : "✗"} {cr.label}</span><span className={`mono text-[11px] ${cr.pass ? "text-ok" : "text-warn"}`}>{cr.count}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      {running && <Spinner label="Running benchmark..." />}
      {result?.bench && (
        <Panel title="Benchmark Result">
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div>Top-1: <strong className="mono text-ok block">{pct(result.bench.top1)}</strong></div>
            <div>NONE Prec: <strong className="mono text-ink block">{pct(result.bench.nonePrecision)}</strong></div>
            <div>Cases: <strong className="mono text-ink block">{result.bench.n}</strong></div>
          </div>
        </Panel>
      )}
      <Panel title={`Cases (${cases.length})`}>
        <div className="max-h-[350px] overflow-auto">
          <table className="dtable">
            <thead><tr><th>Task</th><th>Expected</th><th>Split</th></tr></thead>
            <tbody>
              {cases.map((c, i) => (
                <tr key={i}><td className="text-xs truncate max-w-[300px]">{c.task}</td><td className="mono text-xs font-semibold">{c.expect}</td><td className="mono text-[11px] text-ink-2">{c.split}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </Page>
  );
}

export function ClustersScreen() {
  const { data, loading } = useApi<{ clusters: any[] }>("/api/clusters");
  if (loading && !data) return <Page title="Clusters"><Spinner label="Loading..." /></Page>;
  return (
    <Page title="Skill Clusters" meta="Grouping redundancy: verify one primary per cluster.">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {(data?.clusters || []).map((c) => (
          <Panel key={c.cluster} title={c.cluster} actions={<span className="text-xs mono text-ink-2">{c.members.length}</span>}>
            <div className="text-xs">
              <div className="text-ink-2 mb-1">Primary: {c.primary ? <span className="mono text-ok">{c.primary}</span> : <span className="text-bad">None</span>}</div>
              <ul className="border-t border-line pt-1 text-ink-2">
                {c.members.map((m: any) => (
                  <li key={m.id} className="flex justify-between mono truncate"><span>{m.id}</span><span>[{m.role}]</span></li>
                ))}
              </ul>
            </div>
          </Panel>
        ))}
      </div>
    </Page>
  );
}
