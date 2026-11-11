import { useEffect, useState } from "react";
import { api, type Page as P } from "../lib/api.ts";
import { go } from "../lib/route.ts";
import { Modal } from "../ui/overlay.tsx";
import { Input } from "../ui/controls.tsx";
import { TierChip } from "../ui/chips.tsx";

/** Ctrl K: jump to a skill by id or purpose. Opens the Library drawer. */
export function Palette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<P["rows"]>([]);
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!open || q.trim().length < 2) return setRows([]);
    const t = setTimeout(() => {
      api.get<P>(`/api/skills?size=10&q=${encodeURIComponent(q)}`).then((p) => { setRows(p.rows); setI(0); }).catch(() => setRows([]));
    }, 120);
    return () => clearTimeout(t);
  }, [q, open]);
  const pick = (id: string) => {
    onClose();
    setQ("");
    go("library", { open: id });
  };
  return (
    <Modal open={open} onClose={onClose} title="Search skills">
      <Input
        autoFocus
        aria-label="Skill id or purpose"
        placeholder="Type 2 or more characters"
        className="w-full"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setI((n) => Math.min(rows.length - 1, n + 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setI((n) => Math.max(0, n - 1)); }
          if (e.key === "Enter" && rows[i]) pick(rows[i].id);
        }}
      />
      <ul role="listbox" aria-label="Matches" className="mt-2 max-h-80 overflow-auto">
        {rows.map((r, n) => (
          <li
            key={r.id}
            role="option"
            aria-selected={n === i}
            onMouseEnter={() => setI(n)}
            onClick={() => pick(r.id)}
            className={`flex h-9 cursor-pointer items-center gap-2 rounded-[6px] px-2 text-[13px] ${n === i ? "bg-surface-2" : ""}`}
          >
            <TierChip tier={r.tier} stale={r.state === "stale"} />
            <span className="mono truncate">{r.id}</span>
            <span className="ml-auto text-[12px] text-ink-2">{r.domain}</span>
          </li>
        ))}
        {q.trim().length >= 2 && rows.length === 0 && <li className="px-2 py-3 text-[13px] text-ink-2">No skill matches "{q}". Try a shorter id fragment.</li>}
      </ul>
    </Modal>
  );
}
