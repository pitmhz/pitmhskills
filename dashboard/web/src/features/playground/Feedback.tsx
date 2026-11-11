import { useState } from "react";
import { toast } from "sonner";
import { api, type HttpError } from "../../lib/api.ts";
import { Button, Input } from "../../ui/controls.tsx";

/** "Was this right?" -> append one case to the repo's own benchmark file (no post-step needed). */
export function Feedback({ task, picks, outcome }: { task: string; picks: string[]; outcome: string }) {
  const [mode, setMode] = useState<"ask" | "no" | "done">("ask");
  const [expect, setExpect] = useState(outcome === "ABSTAIN" ? "NONE" : picks[1] ?? "NONE");
  const [heldout, setHeldout] = useState(false);
  const right = outcome === "ABSTAIN" ? "NONE" : picks[0] ?? "NONE";

  const add = async (value: string) => {
    try {
      const r = await api.post<{ file: string }>("/api/eval/cases", { task, expect: value, split: heldout ? "heldout" : "train" });
      toast(`Added to ${r.file}: expect ${value}`);
      setMode("done");
    } catch (e) {
      toast.error(`Not added: ${(e as HttpError).body.error}`);
    }
  };

  if (mode === "done") return <p className="text-[13px] text-ink-2">Case recorded. Route another task to keep going.</p>;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[8px] border border-line bg-surface px-4 py-3 text-[13px]">
      <span>Was this right?</span>
      <Button onClick={() => add(right)}>Yes, add as expect {right}</Button>
      <Button onClick={() => setMode("no")}>No</Button>
      {mode === "no" && (
        <>
          <label htmlFor="expect" className="text-ink-2">expected</label>
          <Input id="expect" list="expect-options" className="mono w-80" value={expect} onChange={(e) => setExpect(e.target.value.trim())} />
          <datalist id="expect-options">
            <option value="NONE" />
            {picks.map((p) => <option key={p} value={p} />)}
          </datalist>
          <Button variant="primary" disabled={!expect} onClick={() => add(expect)}>Add to eval set</Button>
        </>
      )}
      <label className="ml-auto flex items-center gap-2 text-[12px] text-ink-2">
        <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={heldout} onChange={(e) => setHeldout(e.target.checked)} />
        held-out (never used for calibration)
      </label>
    </div>
  );
}
