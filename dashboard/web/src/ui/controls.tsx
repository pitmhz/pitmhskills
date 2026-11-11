import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import { Tooltip } from "radix-ui";
import { cn } from "../lib/format.ts";

type Variant = "primary" | "secondary" | "ghost" | "danger";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-white border-accent hover:brightness-110",
  secondary: "bg-surface text-ink border-line hover:bg-surface-2",
  ghost: "bg-transparent text-ink-2 border-transparent hover:bg-surface-2 hover:text-ink",
  danger: "bg-surface text-bad border-bad/50 hover:bg-bad/10",
};

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }>(
  ({ variant = "secondary", className, ...p }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex h-8 min-w-8 items-center justify-center gap-1.5 rounded-[6px] border px-3 text-[13px] font-medium",
        "disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:size-4 [&_svg]:stroke-[1.5]",
        VARIANTS[variant], className,
      )}
      {...p}
    />
  ),
);

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => (
  <input
    ref={ref}
    className={cn("h-8 rounded-[6px] border border-line bg-surface-2 px-2.5 text-[13px] text-ink placeholder:text-ink-2", className)}
    {...p}
  />
));

export function Select({ className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn("h-8 rounded-[6px] border border-line bg-surface-2 px-2 text-[13px] text-ink", className)} {...p}>
      {children}
    </select>
  );
}

/** Tooltip that supplements visible text; never the only place information lives. */
export function Tip({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          sideOffset={6}
          className="anim-fade z-50 max-w-72 rounded-[6px] border border-line bg-surface px-2.5 py-1.5 text-[12px] text-ink shadow-overlay"
        >
          {label}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

export function Panel({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-[8px] border border-line bg-surface", className)}>
      {(title || actions) && (
        <header className="flex h-10 items-center justify-between border-b border-line px-4">
          <h2 className="text-[13px] font-semibold">{title}</h2>
          <div className="flex items-center gap-2">{actions}</div>
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return <label htmlFor={htmlFor} className="text-[12px] text-ink-2">{children}</label>;
}

/** Empty state: always names the next action (PRD 6.3). */
export function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-[8px] border border-dashed border-line px-4 py-6 text-[13px] text-ink-2">
      <p>{children}</p>
      {action}
    </div>
  );
}

/** Error: what failed, why, what to do, with an expandable excerpt. */
export function ErrorNote({ what, why, next, detail }: { what: string; why?: string; next?: string; detail?: string }) {
  return (
    <div role="alert" className="rounded-[8px] border border-bad/40 bg-bad/5 px-4 py-3 text-[13px]">
      <p className="font-medium text-bad">{what}</p>
      {why && <p className="text-ink-2">{why}</p>}
      {next && <p className="text-ink">{next}</p>}
      {detail && (
        <details className="mt-2">
          <summary className="cursor-pointer text-[12px] text-ink-2">Show output</summary>
          <pre className="mono mt-1 max-h-40 overflow-auto whitespace-pre-wrap text-[12px] text-ink-2">{detail.split("\n").slice(0, 40).join("\n")}</pre>
        </details>
      )}
    </div>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-[13px] text-ink-2">
      <span aria-hidden className="size-3 rounded-full border-2 border-line border-t-accent motion-safe:animate-spin" />
      {label}
    </span>
  );
}
