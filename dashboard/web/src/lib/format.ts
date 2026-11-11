import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...v: ClassValue[]) => twMerge(clsx(v));

const nf = new Intl.NumberFormat("en-US");
export const num = (n: number | null | undefined) => (n === null || n === undefined ? "—" : nf.format(n));

export function bytes(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  if (n < 1024) return `${nf.format(n)} B`;
  return `${(n / 1024).toFixed(1)} KB`;
}

export const pct = (r: number | null | undefined) => (r === null || r === undefined ? "—" : `${(r * 100).toFixed(1)}%`);

export function time(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  const hm = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return sameDay ? hm : `${d.toLocaleDateString("en-CA")} ${hm}`;
}

/** ok under 80% of budget, warn 80-100%, bad over (PRD 6.3). */
export function budgetState(value: number, budget: number): "ok" | "warn" | "bad" {
  if (value > budget) return "bad";
  if (value >= budget * 0.8) return "warn";
  return "ok";
}
