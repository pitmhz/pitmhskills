import { useState, useEffect } from "react";
import { toast } from "sonner";
import { api, useApi } from "../../lib/api.ts";
import { Page } from "../../shell.tsx";
import { Button, ErrorNote, Input, Panel, Spinner } from "../../ui/controls.tsx";
import { DiffDialog } from "../../ui/diff-dialog.tsx";

const FIELDS = [
  { key: "floor", label: "Candidate Floor", desc: "Minimum score to consider (45)" },
  { key: "margin", label: "Victory Margin", desc: "Top-1 lead over rank 2 (15)" },
  { key: "pick_floor", label: "Instant Pick Floor", desc: "Threshold to pick without ASK (80)" },
  { key: "max_bytes", label: "Max Task Bytes", desc: "Hard cap in bytes (20480)" },
  { key: "avg_bytes_target", label: "Target Avg Bytes", desc: "Target avg bytes delivered (12288)" },
  { key: "max_skills_per_task", label: "Max Skills", desc: "Max skills loaded (2)" },
];

export function ConfigScreen() {
  const { data, error, reload } = useApi<{ config: Record<string, any> }>("/api/config");
  const [cfg, setCfg] = useState<Record<string, any>>({});
  const [activePlan, setActivePlan] = useState<any>(null);
  const [applying, setApplying] = useState(false);

  useEffect(() => { if (data?.config) setCfg(data.config); }, [data]);

  const onPlan = async () => {
    try { setActivePlan(await api.put<any>("/api/config", cfg)); } catch (err: any) { toast.error(`Plan failed: ${err.message}`); }
  };

  const onApply = async () => {
    if (!activePlan) return;
    setApplying(true);
    try {
      const res = await api.post<any>("/api/skills/config.json/apply", { plan_id: activePlan.plan_id });
      if (res.ok) { toast.success("Config updated"); setActivePlan(null); reload(); }
      else toast.error(`Reverted: ${res.error}`);
    } catch (err: any) { toast.error(`Apply failed: ${err.message}`); } finally { setApplying(false); }
  };

  if (!data && !error) return <Page title="Router Config"><Spinner label="Loading..." /></Page>;

  return (
    <Page title="Router Config" meta="Tuning parameters governed by write protocol." actions={<Button variant="primary" onClick={onPlan}>Plan Changes</Button>}>
      {error && <ErrorNote what="Could not load config" why={error.message} />}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {FIELDS.map(({ key, label, desc }) => (
          <Panel key={key} title={label}>
            <div className="flex flex-col gap-1 text-xs">
              <span className="text-ink-2">{desc}</span>
              <Input type="number" className="mono font-semibold" value={cfg[key] ?? ""} onChange={(e) => setCfg({ ...cfg, [key]: Number(e.target.value) })} />
            </div>
          </Panel>
        ))}
      </div>
      <DiffDialog open={!!activePlan} onClose={() => setActivePlan(null)} onConfirm={onApply} title="Review Changes" diffs={activePlan?.diffs || []} willRun={activePlan?.will_run} loading={applying} />
    </Page>
  );
}
