import { useState } from "react";
import { api, type RouteResult } from "../../lib/api.ts";
import { bytes, num } from "../../lib/format.ts";
import { useApi } from "../../lib/api.ts";
import { Button, Input, Spinner } from "../../ui/controls.tsx";
import { DecisionBadge } from "../../ui/chips.tsx";

export function BodyTab({ d }: { d: { body: { text: string; bytes: number; truncated: boolean }; sections: { name: string; bytes: number }[] } }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12px] text-ink-2">
        SKILL.md <span className="mono">{bytes(d.body.bytes)}</span>{d.body.truncated && " · preview of first 4 KB"} · read-only
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

export function RoutingTab({ d }: { d: { card: { id: string; use_when?: string[] } } }) {
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
      <p className="text-[12px] text-ink-2">Seeded from use_when. Edit any query, then run.</p>
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

export function HistoryTab({ id }: { id: string }) {
  const { data } = useApi<{ changes: any[] }>(`/api/changes?id=${encodeURIComponent(id)}`);
  const changes = data?.changes || [];

  return (
    <div className="flex flex-col gap-3 text-xs">
      {changes.length === 0 ? (
        <p className="text-ink-2">No recorded mutations for this skill.</p>
      ) : (
        changes.map((c, i) => (
          <div key={i} className="rounded-[6px] border border-line bg-surface-2 p-2.5">
            <div className="flex justify-between items-center mb-1">
              <span className="font-semibold text-ink">{c.op}</span>
              <span className="mono text-[11px] text-ink-2">{c.time}</span>
            </div>
            {c.note && <div className="text-ink-2 mb-1">{c.note}</div>}
            {c.diff && (
              <details>
                <summary className="cursor-pointer text-[11px] text-accent">View diff</summary>
                <pre className="mono text-[10px] mt-1 p-1.5 bg-surface rounded max-h-32 overflow-auto whitespace-pre">{c.diff}</pre>
              </details>
            )}
          </div>
        ))
      )}
    </div>
  );
}
