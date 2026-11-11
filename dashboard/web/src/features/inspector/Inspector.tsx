import { useState } from "react";
import { api, useApi, type Row, type RouteResult } from "../../lib/api.ts";
import { bytes, num } from "../../lib/format.ts";
import { Sheet, Tabs } from "../../ui/overlay.tsx";
import { Button, ErrorNote, Input, Spinner } from "../../ui/controls.tsx";
import { DecisionBadge, StateCell, TierChip } from "../../ui/chips.tsx";

type Detail = {
  card: Record<string, unknown> & { id: string; purpose?: string; use_when?: string[]; disambiguator?: string };
  row: Row; errors: string[]; sections: { name: string; bytes: number }[];
  body: { text: string; bytes: number; truncated: boolean };
};

const LABELS: Record<string, string> = {
  use_when: "Situations where this is the best choice",
  do_not_use_when: "Situations where another skill or none is better",
  pick_over_primary_when: "Pick this variant over the primary when",
};
const HIDDEN = new Set(["purpose", "sections", "hash", "id"]);

export function Inspector({ id, onClose }: { id: string | null; onClose: () => void }) {
  const [tab, setTab] = useState("card");
  const { data, error } = useApi<Detail>(id ? `/api/skills/${encodeURIComponent(id)}` : null);
  const d = data && data.card.id === id ? data : null;
  return (
    <Sheet open={!!id} onClose={onClose} title={id ?? ""}>
      {error && <div className="p-4"><ErrorNote what="Could not load this skill" why={error.body.error} next={error.body.next} /></div>}
      {!d && !error && <div className="p-4"><Spinner label="Loading card" /></div>}
      {d && (
        <Tabs value={tab} onChange={setTab} tabs={[
          { id: "card", label: "Card", body: <CardTab d={d} /> },
          { id: "body", label: "Body", body: <BodyTab d={d} /> },
          { id: "routing", label: "Routing", body: <RoutingTab d={d} /> },
          { id: "history", label: "History", body: <p className="text-[13px] text-ink-2">The changelog arrives with the write core in slice S3. No dashboard writes have touched this skill.</p> },
        ]} />
      )}
    </Sheet>
  );
}

function CardTab({ d }: { d: Detail }) {
  const c = d.card;
  return (
    <div className="flex flex-col gap-4 text-[13px]">
      <div className="rounded-[8px] border border-line bg-surface-2 p-3">
        <div className="mb-2 flex items-center gap-2">
          <TierChip tier={d.row.tier} stale={d.row.state === "stale"} />
          <StateCell state={d.row.state} />
          <span className="ml-auto text-[12px] text-ink-2">{d.row.domain} · {d.row.cluster} ({d.row.role})</span>
        </div>
        <p>{String(c.purpose ?? "")}</p>
      </div>
      {d.errors.length > 0 && <ErrorNote what="Validator reports problems" why={d.errors.join("; ")} next="Edit the card or re-review the skill body (editing arrives in S4)." />}
      {c.disambiguator ? <p className="border-l-2 border-accent pl-3 text-ink-2">{String(c.disambiguator)}</p> : null}
      <dl className="flex flex-col gap-3">
        {Object.entries(c).filter(([k]) => !HIDDEN.has(k)).map(([k, v]) => (
          <div key={k}>
            <dt className="text-[12px] text-ink-2">{LABELS[k] ?? k}</dt>
            <dd className={typeof v === "number" ? "mono" : ""}>{render(v)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function render(v: unknown) {
  if (v === null || v === undefined || v === "") return <span className="text-ink-2">—</span>;
  if (Array.isArray(v)) {
    if (v.length === 0) return <span className="text-ink-2">none</span>;
    if (v.every((x) => typeof x === "string")) return <ul className="list-disc pl-4">{v.map((x, i) => <li key={i}>{x as string}</li>)}</ul>;
  }
  if (typeof v === "object") return <pre className="mono whitespace-pre-wrap text-[12px]">{JSON.stringify(v, null, 2)}</pre>;
  if (typeof v === "boolean") return v ? "yes" : "no";
  return String(v);
}

function BodyTab({ d }: { d: Detail }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12px] text-ink-2">
        SKILL.md <span className="mono">{bytes(d.body.bytes)}</span>{d.body.truncated && " · preview of the first 4 KB"} · read-only
      </p>
      {d.sections.length > 0 && (
        <ol className="flex flex-col gap-1 rounded-[8px] border border-line p-3 text-[12px]">
          {d.sections.map((s) => (
            <li key={s.name} className="flex justify-between gap-2"><span className="truncate">{s.name}</span><span className="mono text-ink-2">{num(s.bytes)} B</span></li>
          ))}
        </ol>
      )}
      <pre className="mono whitespace-pre-wrap rounded-[8px] border border-line bg-surface-2 p-3 text-[12px] leading-5">{d.body.text || "Body file not found at skill_path."}</pre>
    </div>
  );
}

/** Test this skill: does the router pick it for these queries? */
function RoutingTab({ d }: { d: Detail }) {
  const seed = (d.card.use_when ?? []).slice(0, 5).map((s) => s.slice(0, 160));
  const [qs, setQs] = useState<string[]>([...seed, ...Array(5 - seed.length).fill("")]);
  const [res, setRes] = useState<Record<number, RouteResult | "err" | "run">>({});
  const runAll = async () => {
    for (const [i, q] of qs.entries()) {
      if (!q.trim()) continue;
      setRes((r) => ({ ...r, [i]: "run" }));
      const out = await api.post<RouteResult>("/api/route", { task: q }).catch(() => "err" as const);
      setRes((r) => ({ ...r, [i]: out }));
    }
  };
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12px] text-ink-2">Seeded from use_when. Edit any query, then run. Each run calls the router once.</p>
      {qs.map((q, i) => {
        const r = res[i];
        const picked = typeof r === "object" && r.picks[0]?.id === d.card.id && r.outcome !== "ABSTAIN";
        return (
          <div key={i} className="flex flex-col gap-1">
            <Input aria-label={`Query ${i + 1}`} value={q} onChange={(e) => setQs((a) => a.map((x, n) => (n === i ? e.target.value : x)))} />
            <div className="flex h-6 items-center gap-2 text-[12px]">
              {r === "run" && <Spinner label="routing" />}
              {r === "err" && <span className="text-bad">router error</span>}
              {typeof r === "object" && (
                <>
                  <DecisionBadge outcome={r.outcome} />
                  <span className={picked ? "text-ok" : "text-ink-2"}>{picked ? "● picked this skill" : `○ top: ${r.picks[0]?.id ?? "none"}`}</span>
                </>
              )}
            </div>
          </div>
        );
      })}
      <Button variant="primary" className="self-start" onClick={runAll}>Run {qs.filter((q) => q.trim()).length} queries</Button>
    </div>
  );
}
