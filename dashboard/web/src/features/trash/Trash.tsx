import { toast } from "sonner";
import { api, useApi } from "../../lib/api.ts";
import { useApp } from "../../lib/ctx.tsx";
import { bytes } from "../../lib/format.ts";
import { Page } from "../../shell.tsx";
import { Button, Spinner } from "../../ui/controls.tsx";

export function TrashScreen() {
  const { reloadAudit } = useApp();
  const { data, reload } = useApi<{ backups: any[] }>("/api/trash");

  const onRestore = async (ts: string) => {
    try {
      const res = await api.post<any>(`/api/trash/${encodeURIComponent(ts)}/restore`);
      if (res.ok) { toast.success(`Restored snapshot ${ts}`); reload(); reloadAudit(); }
    } catch (err: any) { toast.error(`Restore failed: ${err.message}`); }
  };

  const onPurge = async (ts?: string) => {
    try {
      await api.post("/api/trash/purge", { timestamp: ts });
      toast.success(ts ? `Purged ${ts}` : "Purged all");
      reload();
    } catch (err: any) { toast.error(`Purge failed: ${err.message}`); }
  };

  if (!data) return <Page title="Trash"><Spinner label="Loading trash..." /></Page>;
  return (
    <Page title="Trash & Snapshots" actions={data.backups.length ? <Button variant="danger" onClick={() => onPurge()}>Purge All</Button> : undefined}>
      <div className="flex flex-col gap-2.5">
        {!data.backups.length ? <p className="text-xs text-ink-2">Trash is empty.</p> :
          data.backups.map((b) => (
            <div key={b.timestamp} className="flex items-center justify-between p-2.5 border border-line bg-surface rounded text-xs">
              <span className="mono">{b.timestamp} ({bytes(b.size)}): {b.files.join(", ")}</span>
              <div className="flex gap-2">
                <Button variant="primary" onClick={() => onRestore(b.timestamp)}>Restore</Button>
                <Button variant="ghost" onClick={() => onPurge(b.timestamp)}>Purge</Button>
              </div>
            </div>
          ))}
      </div>
    </Page>
  );
}

export function ChangesScreen() {
  const { data } = useApi<{ changes: any[] }>("/api/changes");
  if (!data) return <Page title="Changes Log"><Spinner label="Loading changes..." /></Page>;

  return (
    <Page title="Audit Changelog" meta="Append-only log of every write mutation.">
      <div className="flex flex-col gap-2">
        {!data.changes.length ? <p className="text-xs text-ink-2">No mutations recorded yet.</p> :
          data.changes.map((c, i) => (
            <div key={i} className="border border-line bg-surface rounded p-2 text-xs">
              <div className="flex justify-between font-semibold">
                <span>{c.op}</span><span className="mono text-ink-2">{c.time}</span>
              </div>
              <div className="text-ink-2 mt-1">Files: <span className="mono text-ink">{c.files?.join(", ")}</span></div>
            </div>
          ))}
      </div>
    </Page>
  );
}
