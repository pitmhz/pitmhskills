import { useState } from "react";
import { toast } from "sonner";
import { api, useApi, type Page as P } from "../../lib/api.ts";
import { useApp } from "../../lib/ctx.tsx";
import { useKeys } from "../../lib/keys.ts";
import { Page } from "../../shell.tsx";
import { Button, Panel, Spinner } from "../../ui/controls.tsx";
import { TierChip } from "../../ui/chips.tsx";

export function TriageQueue() {
  const { slice, reloadAudit } = useApp();
  const { data, loading, reload } = useApi<P>(`/api/skills?slice=${encodeURIComponent(slice)}&provenance=no&size=100`);
  const [index, setIndex] = useState(0);

  const skills = data?.rows || [];
  const current = skills[index];

  const triageAction = async (action: "A" | "B" | "freeze" | "delete") => {
    if (!current) return;
    try {
      const plan = await api.post<any>(`/api/skills/${encodeURIComponent(current.id)}/plan`, {
        action: action === "delete" || action === "freeze" ? action : "edit",
        fields: action === "A" || action === "B" ? { tier: action } : undefined,
      });
      await api.post<any>(`/api/skills/${encodeURIComponent(current.id)}/apply`, { plan_id: plan.plan_id });
      toast.success(`Action applied: ${action} on ${current.id}`);
      reload();
      reloadAudit();
    } catch (err: any) {
      toast.error(`Action failed: ${err.message || err.body?.error}`);
    }
  };

  useKeys({
    a: () => triageAction("A"),
    b: () => triageAction("B"),
    f: () => triageAction("freeze"),
    d: () => triageAction("delete"),
    j: () => setIndex((i) => Math.min(skills.length - 1, i + 1)),
    k: () => setIndex((i) => Math.max(0, i - 1)),
  });

  if (loading && !data) return <Page title="Triage Queue"><Spinner label="Loading queue..." /></Page>;

  return (
    <Page title="Triage Queue" meta={`Review unprovenanced skills. ${skills.length} pending in ${slice}.`}>
      {skills.length === 0 ? (
        <Panel><div className="py-6 text-center text-xs text-ink-2">🎉 All caught up for slice: {slice}</div></Panel>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-4">
          <Panel title={`Queue (${index + 1}/${skills.length})`}>
            <ul className="flex flex-col gap-1 max-h-[400px] overflow-auto">
              {skills.map((s, idx) => (
                <li key={s.id} onClick={() => setIndex(idx)}
                  className={`flex items-center gap-2 p-2 rounded cursor-pointer text-xs ${idx === index ? "bg-surface-2 border-l-2 border-accent" : "hover:bg-surface-2"}`}>
                  <TierChip tier={s.tier} /><span className="mono truncate flex-1">{s.id}</span>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title={current?.id} actions={
            <div className="flex gap-1 text-xs">
              <Button onClick={() => triageAction("A")}>[A] Tier A</Button>
              <Button onClick={() => triageAction("B")}>[B] Tier B</Button>
              <Button onClick={() => triageAction("freeze")}>[F] Freeze</Button>
              <Button variant="danger" onClick={() => triageAction("delete")}>[D] Delete</Button>
            </div>
          }>
            <div className="flex flex-col gap-2 text-xs">
              <div className="p-2.5 bg-surface-2 rounded border border-line">
                <span className="text-ink-2 block mb-1">Purpose:</span>
                <span className="text-ink font-medium">{current?.purpose}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-ink-2">
                <div>Domain: <span className="mono text-ink">{current?.domain}</span></div>
                <div>Cluster: <span className="mono text-ink">{current?.cluster}</span></div>
                <div>License: <span className="mono text-ink">{current?.license}</span></div>
              </div>
            </div>
          </Panel>
        </div>
      )}
    </Page>
  );
}
