import { useEffect, useState } from "react";
import { CornerDownLeft } from "lucide-react";
import { api, useApi, type HttpError, type RouteResult } from "../../lib/api.ts";
import { useApp, useFlag } from "../../lib/ctx.tsx";
import { setParam, type Loc } from "../../lib/route.ts";
import { time } from "../../lib/format.ts";
import { Page } from "../../shell.tsx";
import { Button, Empty, ErrorNote, Input, Panel, Spinner } from "../../ui/controls.tsx";
import { ByteMeter, DecisionBadge, TierChip } from "../../ui/chips.tsx";
import { Feedback } from "./Feedback.tsx";

type Hist = { task: string; outcome: string; top: string | null; at: string }[];

export function Playground({ loc }: { loc: Loc }) {
  const { audit } = useApp();
  const json = useFlag("HAS_JSON_OUTPUT");
  const [task, setTask] = useState(loc.params.get("task") ?? "");
  const [res, setRes] = useState<RouteResult | null>(null);
  const [err, setErr] = useState<HttpError | null>(null);
  const [busy, setBusy] = useState(false);
  const hist = useApi<Hist>("/api/route/history");
  const cap = audit?.budget.max_bytes ?? 20480;

  const run = async (t = task) => {
    if (t.trim().length < 2) return;
    setBusy(true); setErr(null); setTask(t);
    setParam(loc, { task: t });
    try { setRes(await api.post<RouteResult>("/api/route", { task: t })); hist.reload(); }
    catch (e) { setErr(e as HttpError); setRes(null); }
    finally { setBusy(false); }
  };
  useEffect(() => { if (loc.params.get("task")) run(loc.params.get("task")!); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const top = res?.picks[0];
  const askOptions = res?.outcome === "ASK" ? parseAsk(res.question ?? "") : [];

  return (
    <Page title="Playground" meta="Route a task exactly as an agent would. Nothing is written except the 20-query history.">
      <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); run(); }}>
        <label htmlFor="task" className="text-[12px] text-ink-2">Task</label>
        <Input id="task" className="flex-1" value={task} onChange={(e) => setTask(e.target.value)} placeholder="add scroll animation to a landing page" />
        <Button variant="primary" type="submit" disabled={busy || !json.on} title={json.reason}><CornerDownLeft aria-hidden /> Route</Button>
      </form>
      <p className="-mt-2 text-[12px] text-ink-2">
        repo <span className="mono">.</span> · router <span className="mono">json</span>{res && <> · <span className="mono">{(res.ms / 1000).toFixed(1)} s</span></>}
      </p>

      {busy && <Spinner label="Routing (cold start can take 2 s)" />}
      {err && <ErrorNote what={err.body.error} why={err.body.why} next={err.body.next} detail={err.body.detail} />}
      {!res && !busy && !err && <Empty>Type a task and press Route. Try "wordpress theme development" to see an ABSTAIN.</Empty>}

      {res && !busy && (
        <>
          <Panel title="Decision">
            <div className="flex flex-col gap-3 text-[13px]">
              <div className="flex flex-wrap items-center gap-3">
                <DecisionBadge outcome={res.outcome} />
                {res.outcome === "ABSTAIN" ? (
                  <span className="text-ink-2">Router found no suitable skill. Agents proceed without one.</span>
                ) : top && (
                  <>
                    <span className="mono font-medium">{top.id}</span>
                    <span className="text-ink-2">score <span className="mono text-ink">{res.confidence}</span></span>
                    <span className="text-ink-2">margin <span className="mono text-ink">{res.margin}</span></span>
                    {top.tier && <TierChip tier={top.tier} />}
                    {top.cluster && <span className="text-ink-2">cluster {top.cluster}</span>}
                  </>
                )}
              </div>
              <p><span className="text-ink-2">why </span>{res.why}</p>
              {res.outcome === "ASK" && (
                <div className="flex flex-col gap-2 border-l-2 border-accent pl-3">
                  <p>{res.question}</p>
                  <div className="flex flex-wrap gap-2">
                    {askOptions.map((o) => <Button key={o.id} onClick={() => run(`${task} (${o.hint})`)}>Re-run as {o.id}</Button>)}
                  </div>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-6">
                <ByteMeter label="delivered" value={res.bytes_total} budget={cap} />
                <span className="text-[12px] text-ink-2">skills loaded <span className="mono text-ink">{res.skills_loaded}</span>{res.paired && <> · paired <span className="mono">{res.paired}</span></>}</span>
              </div>
            </div>
          </Panel>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
            <Panel title="Candidates">
              {res.picks.length === 0 ? <p className="text-[13px] text-ink-2">No candidate scored above zero.</p> : (
                <ol className="flex flex-col text-[13px]">
                  {res.picks.map((p, i) => (
                    <li key={p.id} className="grid grid-cols-[24px_1fr_48px_32px] items-center gap-2 border-b border-line py-1.5 last:border-0">
                      <span className="mono text-ink-2">{i + 1}</span>
                      <span className="min-w-0"><a className="mono block truncate hover:underline" href={`#/library?open=${encodeURIComponent(p.id)}`}>{p.id}</a><span className="block truncate text-[12px] text-ink-2">{p.reason}</span></span>
                      <span className="mono num">{p.score ?? "—"}</span>
                      {p.tier ? <TierChip tier={p.tier} /> : <span />}
                    </li>
                  ))}
                </ol>
              )}
            </Panel>
            <Panel title="Dropped or collapsed">
              {res.dropped?.length ? (
                <ul className="text-[13px]">{res.dropped.map((d) => <li key={d.id}><span className="mono">{d.id}</span> <span className="text-ink-2">{d.why}</span></li>)}</ul>
              ) : <p className="text-[13px] text-ink-2">The router JSON does not report gate drops. Tier C skills never enter the pool.</p>}
            </Panel>
          </div>

          <Feedback task={task} picks={res.picks.map((p) => p.id)} outcome={res.outcome} />
          <details className="text-[12px] text-ink-2">
            <summary className="cursor-pointer">Raw router output (first 2 KB)</summary>
            <pre className="mono mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-[8px] border border-line bg-surface-2 p-3">{res.raw_excerpt}</pre>
          </details>
        </>
      )}

      <Panel title="Recent queries">
        {hist.data?.length ? (
          <ul className="flex flex-col text-[13px]">
            {hist.data.map((h, i) => (
              <li key={i} className="flex items-center gap-3 border-b border-line py-1 last:border-0">
                <button className="truncate text-left hover:underline" onClick={() => run(h.task)}>{h.task}</button>
                <span className="mono ml-auto shrink-0 text-[12px] text-ink-2">{h.outcome} · {h.top ?? "none"} · {time(h.at)}</span>
              </li>
            ))}
          </ul>
        ) : <p className="text-[13px] text-ink-2">No queries yet. History keeps the last 20 in dashboard/.state.</p>}
      </Panel>
    </Page>
  );
}

/** "1) id: hint text 2) id: hint" -> options. */
function parseAsk(q: string): { id: string; hint: string }[] {
  return [...q.matchAll(/(\d)\)\s*([\w.-]+__[\w.-]+):\s*(.*?)(?=\s\d\)\s|\sReply|$)/g)].map((m) => ({ id: m[2], hint: m[3].split(/->|\./)[0].trim().slice(0, 80) }));
}
