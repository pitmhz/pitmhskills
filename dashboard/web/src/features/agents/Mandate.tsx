import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, useApi } from "../../lib/api.ts";
import { useApp } from "../../lib/ctx.tsx";
import { bytes, num } from "../../lib/format.ts";
import { Page } from "../../shell.tsx";
import { Button, ErrorNote, Panel, Spinner } from "../../ui/controls.tsx";
import { ByteMeter, StatusMark } from "../../ui/chips.tsx";
import { DiffDialog } from "../../ui/diff-dialog.tsx";

type MandateData = {
  mode: "A" | "B";
  text: string;
  bytes: number;
  target_bytes: number;
  cap_bytes: number;
  lint: { rule: string; ok: boolean; level: "error" | "warn"; detail?: string }[];
  targets: { rel: string; bytes: number }[];
  drift: number;
};

export function MandateScreen() {
  const { reloadAudit } = useApp();
  const { data, error, reload } = useApi<MandateData>("/api/mandate");
  const [text, setText] = useState("");
  const [activePlan, setActivePlan] = useState<any>(null);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (data?.text) setText(data.text);
  }, [data]);

  const onPlan = async () => {
    try {
      const plan = await api.put<any>("/api/mandate", { text, sync_targets: ["AGENTS.md"] });
      setActivePlan(plan);
    } catch (err: any) {
      toast.error(`Plan failed: ${err.body?.error || err.message}`);
    }
  };

  const onApply = async () => {
    if (!activePlan) return;
    setApplying(true);
    try {
      const res = await api.post<any>("/api/mandate/apply", { plan_id: activePlan.plan_id });
      if (res.ok) {
        toast.success("Mandate updated and verified");
        setActivePlan(null);
        reload();
        reloadAudit();
      } else {
        toast.error(`Validation failed: ${res.error}`);
      }
    } catch (err: any) {
      toast.error(`Apply failed: ${err.body?.error || err.message}`);
    } finally {
      setApplying(false);
    }
  };

  if (!data) return <Page title="Mandate Editor"><Spinner label="Loading mandate..." /></Page>;

  const currentBytes = Buffer.byteLength(text);
  const hasErrors = data.lint.some((l) => l.level === "error" && !l.ok);

  return (
    <Page
      title="Mandate Editor"
      meta={`Mode ${data.mode}: editing AGENTS.md directly. Byte-metered instructions for coding agents.`}
      actions={
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setText(data.text)}>Revert</Button>
          <Button variant="primary" disabled={hasErrors} onClick={onPlan}>Plan Changes</Button>
        </div>
      }
    >
      {error && <ErrorNote what="Could not load mandate" why={error.message} />}

      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4">
        <Panel title="Mandate Source (AGENTS.md)">
          <textarea
            className="mono w-full h-[450px] p-3 text-xs bg-surface-2 border border-line rounded-[6px] text-ink focus:outline-none focus:border-accent"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </Panel>

        <div className="flex flex-col gap-4">
          <Panel title="Size & Budget">
            <div className="flex flex-col gap-3">
              <ByteMeter value={currentBytes} budget={data.target_bytes} label="Size" />
              <div className="text-xs text-ink-2">
                Target: <span className="mono">{data.target_bytes} B</span> · Hard cap: <span className="mono">{data.cap_bytes} B</span>
              </div>
              <div className="text-xs">
                Drift: {data.drift === 0 ? <span className="text-ok">0 files out of sync</span> : <span className="text-warn">{data.drift} targets drifted</span>}
              </div>
            </div>
          </Panel>

          <Panel title="Deterministic Lint Checklist">
            <ul className="flex flex-col gap-2 text-xs">
              {data.lint.map((l, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className={l.ok ? "text-ok" : l.level === "error" ? "text-bad font-bold" : "text-warn"}>
                    {l.ok ? "✓" : "✗"}
                  </span>
                  <div className="flex flex-col">
                    <span className={l.ok ? "text-ink" : l.level === "error" ? "text-bad" : "text-warn"}>{l.rule}</span>
                    {l.detail && <span className="text-[11px] text-ink-2 mono">{l.detail}</span>}
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>

      <DiffDialog
        open={!!activePlan}
        onClose={() => setActivePlan(null)}
        onConfirm={onApply}
        title="Review Mandate Diff"
        diffs={activePlan?.diffs || []}
        willRun={activePlan?.will_run}
        loading={applying}
      />
    </Page>
  );
}
