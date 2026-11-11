import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Snowflake, Trash2 } from "lucide-react";
import { useApi, type Page as P, type Row } from "../../lib/api.ts";
import { useApp } from "../../lib/ctx.tsx";
import { setParam, type Loc } from "../../lib/route.ts";
import { useKeys } from "../../lib/keys.ts";
import { num } from "../../lib/format.ts";
import { Page } from "../../shell.tsx";
import { Button, Empty, ErrorNote, Input, Select, Spinner, Tip } from "../../ui/controls.tsx";
import { StateCell, TierChip } from "../../ui/chips.tsx";
import { Inspector } from "../inspector/Inspector.tsx";

const COLS: { key: keyof Row; label: string; num?: boolean }[] = [
  { key: "id", label: "id" }, { key: "tier", label: "tier" }, { key: "domain", label: "domain" },
  { key: "cluster", label: "cluster" }, { key: "bytes", label: "bytes", num: true }, { key: "state", label: "state" },
];

export function LibraryScreen({ loc }: { loc: Loc }) {
  const { slice } = useApp();
  const p = loc.params;
  const qs = new URLSearchParams({ slice, size: "100" });
  for (const k of ["q", "tier", "provenance", "stale", "sort", "dir", "page", "cluster"]) if (p.get(k)) qs.set(k, p.get(k)!);
  const { data, error, loading } = useApi<P>(`/api/skills?${qs}`);
  const [cursor, setCursor] = useState(0);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const search = useRef<HTMLInputElement>(null);
  const rows = data?.rows ?? [];
  const open = p.get("open");
  const set = (patch: Record<string, string | number | undefined>) => setParam(loc, { page: undefined, ...patch });
  useEffect(() => setCursor(0), [data]);
  useEffect(() => document.querySelector(`[data-row="${cursor}"]`)?.scrollIntoView({ block: "nearest" }), [cursor]);

  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  useKeys({
    "/": () => search.current?.focus(),
    j: () => setCursor((c) => Math.min(rows.length - 1, c + 1)),
    k: () => setCursor((c) => Math.max(0, c - 1)),
    Enter: () => rows[cursor] && setParam(loc, { open: rows[cursor].id }),
    x: () => rows[cursor] && toggle(rows[cursor].id),
  }, !open);

  const sortBy = (key: string) => setParam(loc, { sort: key, dir: p.get("sort") === key && p.get("dir") !== "desc" ? "desc" : undefined });
  const writeReason = "Freeze and delete arrive with the write protocol in slice S4.";

  return (
    <Page title="Library" meta={data ? `${num(data.total)} skills in ${slice === "All" ? "all slices" : slice}` : undefined}>
      <div className="flex flex-wrap items-center gap-2">
        <Input ref={search} aria-label="Search skills" placeholder="Search id or purpose  /" className="w-64" defaultValue={p.get("q") ?? ""}
          onChange={(e) => set({ q: e.target.value || undefined })} />
        <Select aria-label="Tier" value={p.get("tier") ?? "All"} onChange={(e) => set({ tier: e.target.value === "All" ? undefined : e.target.value })}>
          <option value="All">Tier: all</option><option value="A">Tier A</option><option value="B">Tier B</option><option value="C">Tier C</option>
        </Select>
        <Select aria-label="Provenance" value={p.get("provenance") ?? "All"} onChange={(e) => set({ provenance: e.target.value === "All" ? undefined : e.target.value })}>
          <option value="All">Provenance: all</option><option value="yes">Has provenance</option><option value="no">No provenance</option>
        </Select>
        <label className="flex h-8 items-center gap-2 text-[13px]">
          <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={p.get("stale") === "1"} onChange={(e) => set({ stale: e.target.checked ? 1 : undefined })} />
          Stale or invalid
        </label>
        <span className="ml-auto text-[12px] text-ink-2">Selected <span className="mono">{sel.size}</span></span>
        <Tip label={writeReason}><span><Button disabled><Snowflake aria-hidden /> Freeze {sel.size || ""}</Button></span></Tip>
        <Tip label={writeReason}><span><Button variant="danger" disabled><Trash2 aria-hidden /> Delete…</Button></span></Tip>
      </div>

      {error && <ErrorNote what="Could not load skills" why={error.body.why ?? error.message} next="Check that the server is running, then reload." />}
      <div className="overflow-auto rounded-[8px] border border-line bg-surface" style={{ maxHeight: "calc(100vh - 260px)" }}>
        <table className="dtable">
          <thead>
            <tr>
              <th scope="col" className="w-10"><span className="sr-only">Select</span></th>
              {COLS.map((c) => (
                <th key={c.key} scope="col" className={c.num ? "num" : ""} aria-sort={p.get("sort") === c.key ? (p.get("dir") === "desc" ? "descending" : "ascending") : undefined}>
                  <button className="hover:text-ink" onClick={() => sortBy(c.key)}>
                    {c.label}{p.get("sort") === c.key ? (p.get("dir") === "desc" ? " ↓" : " ↑") : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} data-row={i} data-active={i === cursor || r.id === open} onClick={() => { setCursor(i); setParam(loc, { open: r.id }); }}>
                <td onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" aria-label={`Select ${r.id}`} className="size-4 accent-[var(--accent)]" checked={sel.has(r.id)} onChange={() => toggle(r.id)} />
                </td>
                <td className="mono max-w-[360px] truncate" title={r.purpose}>{r.id}</td>
                <td><TierChip tier={r.tier} stale={r.state === "stale"} /></td>
                <td>{r.domain}</td>
                <td className="text-ink-2">{r.cluster}{r.role === "variant" && <span className="ml-1 text-[11px]">(variant)</span>}</td>
                <td className="mono num">{num(r.bytes)}</td>
                <td><StateCell state={r.state} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading && !data && <div className="p-4"><Spinner label="Loading skills" /></div>}
        {data && rows.length === 0 && <div className="p-4"><Empty>No skills match these filters. Clear the search or set Tier to all.</Empty></div>}
      </div>

      {data && (
        <div className="flex items-center justify-end gap-2 text-[12px] text-ink-2">
          <span className="mono">page {data.page}/{data.pages}</span>
          <Button variant="ghost" aria-label="Previous page" disabled={data.page <= 1} onClick={() => setParam(loc, { page: data.page - 1 })}><ChevronLeft aria-hidden /></Button>
          <Button variant="ghost" aria-label="Next page" disabled={data.page >= data.pages} onClick={() => setParam(loc, { page: data.page + 1 })}><ChevronRight aria-hidden /></Button>
        </div>
      )}
      <p className="text-[12px] text-ink-2">Keys: <kbd className="mono">/</kbd> search · <kbd className="mono">j</kbd>/<kbd className="mono">k</kbd> move · <kbd className="mono">Enter</kbd> open · <kbd className="mono">x</kbd> select · <kbd className="mono">Esc</kbd> close</p>

      <Inspector id={open} onClose={() => setParam(loc, { open: undefined })} />
    </Page>
  );
}
