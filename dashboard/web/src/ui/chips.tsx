import { cn, budgetState, bytes } from "../lib/format.ts";
import { Tip } from "./controls.tsx";

/** Tier chips differ by shape and text, never color alone (PRD 6.3). */
export function TierChip({ tier, stale }: { tier: string; stale?: boolean }) {
  const shape =
    tier === "A" ? "bg-ink text-bg border-ink"
    : tier === "B" ? "border-ink-2 text-ink"
    : "border-dashed border-ink-2 text-ink-2 opacity-70";
  return (
    <span className="relative inline-flex">
      <span aria-label={`tier ${tier}`} className={cn("mono inline-flex h-5 w-6 items-center justify-center rounded-[4px] border text-[11px] font-semibold", shape)}>
        {tier}
      </span>
      {stale && <span aria-label="stale" className="absolute -right-1 -top-1 size-1.5 rounded-full bg-warn" />}
    </span>
  );
}

const DECISION: Record<string, { cls: string; tip?: string }> = {
  PICK: { cls: "bg-ink text-bg border-ink" },
  ASK: { cls: "border-accent text-accent" },
  ABSTAIN: { cls: "border-ink-2 text-ink-2" },
  LEGACY_LIST: { cls: "border-warn text-warn", tip: "Legacy router: a list without a decision." },
  ERROR: { cls: "border-bad text-bad" },
};

export function DecisionBadge({ outcome }: { outcome: string }) {
  const d = DECISION[outcome] ?? DECISION.ERROR;
  const el = <span className={cn("mono inline-flex h-6 items-center rounded-[4px] border px-2 text-[12px] font-semibold", d.cls)}>{outcome}</span>;
  return d.tip ? <Tip label={d.tip}>{el}</Tip> : el;
}

export type Status = "ok" | "warn" | "bad" | "na";
const STATUS: Record<Status, { cls: string; mark: string; text: string }> = {
  ok: { cls: "text-ok", mark: "●", text: "pass" },
  warn: { cls: "text-warn", mark: "▲", text: "warn" },
  bad: { cls: "text-bad", mark: "■", text: "fail" },
  na: { cls: "text-ink-2", mark: "○", text: "n/a" },
};

/** Status with a shape mark and a word, so it never depends on color. */
export function StatusMark({ s, text }: { s: Status; text?: string }) {
  const v = STATUS[s];
  return (
    <span className={cn("inline-flex items-center gap-1 text-[12px]", v.cls)}>
      <span aria-hidden className="text-[9px]">{v.mark}</span>
      {text ?? v.text}
    </span>
  );
}

export function StateCell({ state }: { state: "ok" | "stale" | "invalid" }) {
  return <StatusMark s={state === "ok" ? "ok" : state === "stale" ? "warn" : "bad"} text={state} />;
}

/** Horizontal byte meter: `612 / 600 B`, ok < 80%, warn 80-100%, bad over. */
export function ByteMeter({ value, budget, label }: { value: number | null; budget: number; label?: string }) {
  if (value === null) return <span className="text-[12px] text-ink-2">— no measurement</span>;
  const s = budgetState(value, budget);
  const fill = s === "ok" ? "bg-ok" : s === "warn" ? "bg-warn" : "bg-bad";
  const w = Math.min(100, (value / budget) * 100);
  return (
    <div className="flex items-center gap-3">
      {label && <span className="text-[12px] text-ink-2">{label}</span>}
      <div className="h-2 w-40 overflow-hidden rounded-[2px] border border-line bg-surface-2" role="meter" aria-valuenow={value} aria-valuemax={budget} aria-label={label ?? "bytes"}>
        <div className={cn("h-full", fill)} style={{ width: `${w}%` }} />
      </div>
      <span className="mono text-[12px]">{bytes(value)} / {bytes(budget)}</span>
      <StatusMark s={s} text={s === "ok" ? "within budget" : s === "warn" ? "near budget" : "over budget"} />
    </div>
  );
}
