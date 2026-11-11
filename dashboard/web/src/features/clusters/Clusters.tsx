import { useState } from "react";
import { toast } from "sonner";
import { api, useApi } from "../../lib/api.ts";
import { pct, time } from "../../lib/format.ts";
import { Page } from "../../shell.tsx";
import { Button, ErrorNote, Panel, Spinner } from "../../ui/controls.tsx";

export function ClustersScreen() {
  const { data, loading } = useApi<{ clusters: { cluster: string; primary: string | null; members: any[] }[] }>("/api/clusters");

  if (loading && !data) return <Page title="Clusters"><Spinner label="Loading clusters..." /></Page>;

  const clusters = data?.clusters || [];

  return (
    <Page title="Skill Clusters" meta="Functional redundancy grouping: ensure exactly one primary skill per cluster.">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {clusters.map((c) => (
          <Panel
            key={c.cluster}
            title={c.cluster}
            actions={<span className="text-xs text-ink-2 mono">{c.members.length} members</span>}
          >
            <div className="flex flex-col gap-2 text-xs">
              <div className="text-ink-2">
                Primary: {c.primary ? <span className="mono text-ok font-semibold">{c.primary}</span> : <span className="text-bad">None</span>}
              </div>

              <ul className="flex flex-col gap-1 border-t border-line pt-2 mt-1">
                {c.members.map((m) => (
                  <li key={m.id} className="flex justify-between items-center text-ink-2">
                    <span className={`mono truncate ${m.role === "primary" ? "text-ink font-semibold" : ""}`}>
                      {m.id}
                    </span>
                    <span className="mono text-[11px]">[{m.role}]</span>
                  </li>
                ))}
              </ul>
            </div>
          </Panel>
        ))}
      </div>
    </Page>
  );
}

export function EvalScreen() {
  const { data: casesData } = useApi<{ task: string; expect: string; split: string; file: string }[]>("/api/eval/cases");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);

  const runEval = async () => {
    setRunning(true);
    setResult(null);
    try {
      const res = await api.post<any>("/api/eval-run/run");
      setResult(res);
      toast.success("Benchmark completed");
    } catch (err: any) {
      toast.error(`Benchmark failed: ${err.message}`);
    } finally {
      setRunning(false);
    }
  };

  const cases = casesData || [];

  return (
    <Page
      title="Evaluation & Calibration"
      meta="Evaluation benchmark over golden test cases and held-out calibration sets."
      actions={
        <Button variant="primary" onClick={runEval} disabled={running}>
          {running ? "Running Eval..." : "Run Benchmark"}
        </Button>
      }
    >
      {running && <Spinner label="Running evaluations across golden test suites (may take up to 30s)..." />}

      {result?.bench && (
        <Panel title="Benchmark Summary Result">
          <div className="grid grid-cols-3 gap-4 text-xs">
            <div>Top-1 Accuracy: <strong className="mono text-ok text-sm block">{pct(result.bench.top1)}</strong></div>
            <div>NONE Precision: <strong className="mono text-ink text-sm block">{pct(result.bench.nonePrecision)}</strong></div>
            <div>Cases Evaluated: <strong className="mono text-ink text-sm block">{result.bench.n}</strong></div>
          </div>
        </Panel>
      )}

      <Panel title={`Benchmark Cases (${cases.length})`}>
        <div className="max-h-[500px] overflow-auto">
          <table className="dtable">
            <thead>
              <tr>
                <th>Task</th>
                <th>Expected Pick</th>
                <th>Split</th>
                <th>File</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c, i) => (
                <tr key={i}>
                  <td className="text-xs truncate max-w-[320px]">{c.task}</td>
                  <td className="mono text-xs font-semibold">{c.expect}</td>
                  <td className="text-xs text-ink-2 mono">{c.split}</td>
                  <td className="mono text-[11px] text-ink-2">{c.file}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </Page>
  );
}
