import { useState } from "react";
import { toast } from "sonner";
import { api, useApi } from "../../lib/api.ts";
import { useApp } from "../../lib/ctx.tsx";
import { Page } from "../../shell.tsx";
import { Button, ErrorNote, Panel, Spinner } from "../../ui/controls.tsx";
import { ByteMeter } from "../../ui/chips.tsx";
import { DiffDialog } from "../../ui/diff-dialog.tsx";

export function MandateScreen() {
  const { reloadAudit } = useApp();
  const { data, error, reload } = useApi<any>("/api/mandate");
  const [text, setText] = useState("");
  const [activePlan, setActivePlan] = useState<any>(null);
  const [applying, setApplying] = useState(false);

  if (!data && !error) return <Page title="Mandate Editor"><Spinner label="Loading mandate..." /></Page>;
  if (data && text === "" && data.text) setText(data.text);

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
        toast.success("Mandate updated");
        setActivePlan(null);
        reload();
        reloadAudit();
      } else toast.error(`Validation failed: ${res.error}`);
    } catch (err: any) {
      toast.error(`Apply failed: ${err.message}`);
    } finally {
      setApplying(false);
    }
  };

  const hasErrors = data?.lint.some((l: any) => l.level === "error" && !l.ok);
  return (
    <Page
      title="Mandate Editor"
      meta="Mode B: AGENTS.md direct edit with deterministic size and safety checks."
      actions={
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setText(data?.text || "")}>Revert</Button>
          <Button variant="primary" disabled={hasErrors} onClick={onPlan}>Plan Changes</Button>
        </div>
      }
    >
      {error && <ErrorNote what="Could not load mandate" why={error.message} />}
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4">
        <Panel title="Mandate Source (AGENTS.md)">
          <textarea
            className="mono w-full h-[440px] p-2.5 text-xs bg-surface-2 border border-line rounded-[6px] text-ink focus:border-accent"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </Panel>
        <div className="flex flex-col gap-4">
          <Panel title="Size & Budget">
            <ByteMeter value={Buffer.byteLength(text)} budget={data?.target_bytes || 600} label="Size" />
            <div className="text-xs text-ink-2 mt-2">
              Target: <span className="mono">{data?.target_bytes} B</span> · Cap: <span className="mono">{data?.cap_bytes} B</span>
            </div>
          </Panel>
          <Panel title="Safety & Lint Rules">
            <ul className="flex flex-col gap-2 text-xs">
              {data?.lint.map((l: any, i: number) => (
                <li key={i} className="flex items-start gap-1.5">
                  <span className={l.ok ? "text-ok" : l.level === "error" ? "text-bad font-bold" : "text-warn"}>
                    {l.ok ? "✓" : "✗"}
                  </span>
                  <span className={l.ok ? "text-ink" : l.level === "error" ? "text-bad" : "text-warn"}>{l.rule}</span>
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
