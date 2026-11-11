import { useState } from "react";
import { toast } from "sonner";
import { api, useApi, type Row } from "../../lib/api.ts";
import { useApp } from "../../lib/ctx.tsx";
import { Sheet, Tabs } from "../../ui/overlay.tsx";
import { Button, ErrorNote, Input, Select, Spinner } from "../../ui/controls.tsx";
import { StateCell, TierChip } from "../../ui/chips.tsx";
import { DiffDialog } from "../../ui/diff-dialog.tsx";
import { BodyTab, RoutingTab, HistoryTab } from "./InspectorTabs.tsx";

type Detail = {
  card: Record<string, unknown> & { id: string; purpose?: string; use_when?: string[]; disambiguator?: string; tier?: string };
  row: Row; errors: string[]; sections: { name: string; bytes: number }[];
  body: { text: string; bytes: number; truncated: boolean };
};

export function Inspector({ id, onClose }: { id: string | null; onClose: () => void }) {
  const [tab, setTab] = useState("card");
  const { reloadAudit } = useApp();
  const { data, error, reload } = useApi<Detail>(id ? `/api/skills/${encodeURIComponent(id)}` : null);
  const [activePlan, setActivePlan] = useState<any>(null);
  const [applying, setApplying] = useState(false);

  const d = data && data.card.id === id ? data : null;

  const planAction = async (action: "freeze" | "delete" | "edit", fields?: Record<string, unknown>) => {
    if (!id) return;
    try {
      const plan = await api.post<any>(`/api/skills/${encodeURIComponent(id)}/plan`, { action, fields });
      setActivePlan(plan);
    } catch (err: any) {
      toast.error(`Plan failed: ${err.body?.error || err.message}`);
    }
  };

  const applyActivePlan = async () => {
    if (!activePlan || !id) return;
    setApplying(true);
    try {
      const res = await api.post<any>(`/api/skills/${encodeURIComponent(id)}/apply`, { plan_id: activePlan.plan_id });
      if (res.ok) {
        toast.success("Applied successfully");
        setActivePlan(null);
        reload();
        reloadAudit();
      } else {
        toast.error(`Validation failed & reverted: ${res.error}`);
      }
    } catch (err: any) {
      toast.error(`Apply failed: ${err.body?.error || err.message}`);
    } finally {
      setApplying(false);
    }
  };

  return (
    <>
      <Sheet open={!!id} onClose={onClose} title={id ?? ""}>
        {error && <div className="p-4"><ErrorNote what="Could not load this skill" why={error.body.error} next={error.body.next} /></div>}
        {!d && !error && <div className="p-4"><Spinner label="Loading card" /></div>}
        {d && (
          <Tabs value={tab} onChange={setTab} tabs={[
            { id: "card", label: "Card", body: <CardTab d={d} onPlan={planAction} /> },
            { id: "body", label: "Body", body: <BodyTab d={d} /> },
            { id: "routing", label: "Routing", body: <RoutingTab d={d} /> },
            { id: "history", label: "History", body: <HistoryTab id={id!} /> },
          ]} />
        )}
      </Sheet>

      <DiffDialog
        open={!!activePlan}
        onClose={() => setActivePlan(null)}
        onConfirm={applyActivePlan}
        title="Review Mutation Plan"
        diffs={activePlan?.diffs || []}
        willRun={activePlan?.will_run}
        warnings={activePlan?.warnings}
        loading={applying}
      />
    </>
  );
}

function CardTab({ d, onPlan }: { d: Detail; onPlan: (action: "freeze" | "delete" | "edit", fields?: Record<string, unknown>) => void }) {
  const [editing, setEditing] = useState(false);
  const [fields, setFields] = useState<Record<string, any>>({ ...d.card });
  const isFrozen = d.row.tier === "C";

  return (
    <div className="flex flex-col gap-4 text-[13px]">
      <div className="rounded-[8px] border border-line bg-surface-2 p-3">
        <div className="mb-2 flex items-center gap-2">
          <TierChip tier={d.row.tier} stale={d.row.state === "stale"} />
          <StateCell state={d.row.state} />
          <span className="ml-auto text-[12px] text-ink-2">{d.row.domain} · {d.row.cluster} ({d.row.role})</span>
        </div>
        <p>{String(d.card.purpose ?? "")}</p>
      </div>

      <div className="flex gap-2">
        <Button variant={isFrozen ? "primary" : "secondary"} onClick={() => onPlan("freeze")}>
          {isFrozen ? "Unfreeze (Tier B)" : "Freeze (Tier C)"}
        </Button>
        <Button variant="secondary" onClick={() => setEditing(!editing)}>
          {editing ? "Cancel Edit" : "Edit Fields"}
        </Button>
        <Button variant="danger" className="ml-auto" onClick={() => onPlan("delete")}>Delete</Button>
      </div>

      {editing ? (
        <form onSubmit={(e) => { e.preventDefault(); onPlan("edit", fields); }} className="flex flex-col gap-3">
          <div>
            <label className="text-[12px] text-ink-2">Tier</label>
            <Select value={fields.tier || "B"} onChange={(e) => setFields({ ...fields, tier: e.target.value })}>
              <option value="A">Tier A</option><option value="B">Tier B</option><option value="C">Tier C</option>
            </Select>
          </div>
          <div>
            <label className="text-[12px] text-ink-2">Purpose</label>
            <Input className="w-full" value={fields.purpose || ""} onChange={(e) => setFields({ ...fields, purpose: e.target.value })} />
          </div>
          <div>
            <label className="text-[12px] text-ink-2">Disambiguator</label>
            <Input className="w-full" value={fields.disambiguator || ""} onChange={(e) => setFields({ ...fields, disambiguator: e.target.value })} />
          </div>
          <Button variant="primary" type="submit" className="mt-2">Plan Changes</Button>
        </form>
      ) : (
        <>
          {d.errors.length > 0 && <ErrorNote what="Validator reports problems" why={d.errors.join("; ")} next="Edit the card to resolve errors." />}
          {d.card.disambiguator ? <p className="border-l-2 border-accent pl-3 text-ink-2">{String(d.card.disambiguator)}</p> : null}
          <dl className="flex flex-col gap-3">
            {Object.entries(d.card).filter(([k]) => !["purpose", "sections", "hash", "id"].includes(k)).map(([k, v]) => (
              <div key={k}>
                <dt className="text-[12px] text-ink-2">{k}</dt>
                <dd className={typeof v === "number" ? "mono" : ""}>{renderVal(v)}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </div>
  );
}

function renderVal(v: unknown) {
  if (v === null || v === undefined || v === "") return <span className="text-ink-2">—</span>;
  if (Array.isArray(v)) {
    if (v.length === 0) return <span className="text-ink-2">none</span>;
    if (v.every((x) => typeof x === "string")) return <ul className="list-disc pl-4">{v.map((x, i) => <li key={i}>{x as string}</li>)}</ul>;
  }
  if (typeof v === "object") return <pre className="mono whitespace-pre-wrap text-[12px]">{JSON.stringify(v, null, 2)}</pre>;
  if (typeof v === "boolean") return v ? "yes" : "no";
  return String(v);
}
