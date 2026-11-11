import type { ReactNode } from "react";
import { Activity, Boxes, FileText, FlaskConical, History, LayoutGrid, Library, ListChecks, Search, Trash2 } from "lucide-react";
import { useApp } from "./lib/ctx.tsx";
import { href, type Loc } from "./lib/route.ts";
import { cn, num } from "./lib/format.ts";
import { Select, Tip } from "./ui/controls.tsx";

const NAV = [
  { id: "overview", label: "Overview", icon: LayoutGrid },
  { id: "library", label: "Library", icon: Library },
  { id: "playground", label: "Playground", icon: Activity },
  { id: "triage", label: "Triage", icon: ListChecks },
  { id: "clusters", label: "Clusters", icon: Boxes },
  { id: "eval", label: "Eval", icon: FlaskConical },
  { id: "mandate", label: "Mandate", icon: FileText },
  { id: "trash", label: "Trash", icon: Trash2 },
  { id: "changes", label: "Changes", icon: History },
];

export function Shell({ loc, onSearch, children }: { loc: Loc; onSearch: () => void; children: ReactNode }) {
  const { caps, audit, slice, setSlice } = useApp();
  const badge: Record<string, number | undefined> = { triage: audit?.no_provenance };
  const routerOk = caps?.flags.HAS_ROUTER;
  return (
    <div className="flex h-full min-w-[768px]">
      <nav aria-label="Screens" className="flex w-14 shrink-0 flex-col border-r border-line bg-surface lg:w-48">
        <div className="flex h-12 items-center border-b border-line px-4 text-[13px] font-semibold">
          <span className="hidden lg:inline">pitmhskills</span>
          <span className="lg:hidden" aria-hidden>p</span>
        </div>
        <ul className="flex flex-col gap-0.5 p-2">
          {NAV.map(({ id, label, icon: Icon }) => {
            const active = loc.screen === id;
            return (
              <li key={id}>
                <a
                  href={href(id)}
                  aria-current={active ? "page" : undefined}
                  aria-label={label}
                  className={cn(
                    "flex h-8 items-center gap-2.5 rounded-[6px] px-2.5 text-[13px]",
                    active ? "bg-surface-2 font-medium text-ink shadow-[inset_2px_0_0_var(--accent)]" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                  )}
                >
                  <Icon aria-hidden className="size-4 shrink-0 stroke-[1.5]" />
                  <span className="hidden flex-1 lg:inline">{label}</span>
                  {badge[id] ? <span className="mono hidden text-[11px] text-ink-2 lg:inline">{num(badge[id])}</span> : null}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-4 border-b border-line bg-surface px-6">
          <label className="flex items-center gap-2 text-[12px] text-ink-2">
            Slice
            <Select value={slice} onChange={(e) => setSlice(e.target.value)} aria-label="Active slice">
              <option value="All">All</option>
              {caps?.slices.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </label>
          <button
            onClick={onSearch}
            className="flex h-8 w-72 items-center gap-2 rounded-[6px] border border-line bg-surface-2 px-2.5 text-[13px] text-ink-2 hover:text-ink"
          >
            <Search aria-hidden className="size-4 stroke-[1.5]" /> Search skills
            <kbd className="mono ml-auto text-[11px]">Ctrl K</kbd>
          </button>
          <div className="ml-auto">
            <Tip label={routerOk ? `Router: ${caps?.router_cmd.join(" ")}` : "Router not found (HAS_ROUTER false)"}>
              <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-2">
                router <span className={routerOk ? "text-ok" : "text-bad"}>{routerOk ? "● ok" : "■ missing"}</span>
              </span>
            </Tip>
          </div>
        </header>
        <Pipeline />
        <main className="min-h-0 flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}

/** Pipeline bar: one count per stage with the gate it watches. */
function Pipeline() {
  const { audit } = useApp();
  const stages: { label: string; to: string; count: string; warn?: string }[] = [
    { label: "Ingest", to: href("library", { tier: "C" }), count: `${num(audit?.frozen)} staged` },
    { label: "Triage", to: href("library", { provenance: "no" }), count: `${num(audit?.no_provenance)} no provenance`, warn: audit?.no_provenance ? "Skills without a known license wait for review." : undefined },
    { label: "Cluster", to: href("clusters"), count: "groups" },
    { label: "Verify", to: href("eval"), count: audit?.bench ? `top-1 ${(audit.bench.top1 * 100).toFixed(1)}%` : "no run" },
    { label: "Publish", to: href("mandate"), count: audit ? `${num(audit.always_on.max)} B mandate` : "—", warn: audit && audit.always_on.max > audit.budget.always_on_cap ? "Mandate is over the 1 KB cap." : undefined },
  ];
  return (
    <ol aria-label="Pipeline" className="flex h-9 shrink-0 items-center gap-1 border-b border-line bg-bg px-6 text-[12px]">
      {stages.map((s, i) => (
        <li key={s.label} className="flex items-center gap-1">
          {i > 0 && <span aria-hidden className="px-1 text-ink-2">›</span>}
          <a href={s.to} className="flex items-center gap-1.5 rounded-[4px] px-1.5 py-0.5 hover:bg-surface-2">
            <span className="font-medium">{s.label}</span>
            <span className="mono text-ink-2">{s.count}</span>
            {s.warn && <Tip label={s.warn}><span className="text-warn" aria-label={s.warn}>▲</span></Tip>}
          </a>
        </li>
      ))}
    </ol>
  );
}

export function Page({ title, meta, actions, children }: { title: string; meta?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-semibold leading-7">{title}</h1>
          {meta && <p className="text-[12px] text-ink-2">{meta}</p>}
        </div>
        <div className="flex items-center gap-2">{actions}</div>
      </div>
      {children}
    </div>
  );
}
