import type { ReactNode } from "react";
import { Dialog, Tabs as RTabs } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "../lib/format.ts";

/** Right drawer, 480 px. Radix handles Esc, focus trap and focus return to the opener. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode }) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="anim-fade fixed inset-0 z-40 bg-black/10" />
        <Dialog.Content
          aria-describedby={undefined}
          className="anim-drawer fixed inset-y-0 right-0 z-50 flex w-[480px] max-w-full flex-col border-l border-line bg-surface shadow-overlay"
        >
          <header className="flex h-12 items-center justify-between gap-2 border-b border-line px-4">
            <Dialog.Title className="mono truncate text-[13px] font-semibold">{title}</Dialog.Title>
            <Dialog.Close aria-label="Close drawer" className="inline-flex size-8 items-center justify-center rounded-[6px] text-ink-2 hover:bg-surface-2">
              <X className="size-4 stroke-[1.5]" />
            </Dialog.Close>
          </header>
          <div className="min-h-0 flex-1 overflow-auto">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="anim-fade fixed inset-0 z-40 bg-black/20" />
        <Dialog.Content
          aria-describedby={undefined}
          className={cn(
            "anim-fade fixed left-1/2 top-[10vh] z-50 max-h-[80vh] -translate-x-1/2 overflow-auto rounded-[8px] border border-line bg-surface p-4 shadow-overlay",
            wide ? "w-[760px]" : "w-[520px]",
          )}
        >
          <Dialog.Title className="mb-3 text-[14px] font-semibold">{title}</Dialog.Title>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function Tabs({ tabs, value, onChange }: { tabs: { id: string; label: string; body: ReactNode }[]; value: string; onChange: (v: string) => void }) {
  return (
    <RTabs.Root value={value} onValueChange={onChange} className="flex h-full flex-col">
      <RTabs.List className="flex gap-1 border-b border-line px-3" aria-label="Sections">
        {tabs.map((t) => (
          <RTabs.Trigger
            key={t.id}
            value={t.id}
            className="h-9 border-b-2 border-transparent px-2 text-[13px] text-ink-2 data-[state=active]:border-accent data-[state=active]:font-medium data-[state=active]:text-ink"
          >
            {t.label}
          </RTabs.Trigger>
        ))}
      </RTabs.List>
      {tabs.map((t) => (
        <RTabs.Content key={t.id} value={t.id} className="min-h-0 flex-1 overflow-auto p-4">
          {t.body}
        </RTabs.Content>
      ))}
    </RTabs.Root>
  );
}
