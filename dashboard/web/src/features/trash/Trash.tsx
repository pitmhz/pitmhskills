import { toast } from "sonner";
import { api, useApi } from "../../lib/api.ts";
import { useApp } from "../../lib/ctx.tsx";
import { bytes } from "../../lib/format.ts";
import { Page } from "../../shell.tsx";
import { Button, ErrorNote, Spinner } from "../../ui/controls.tsx";

export function TrashScreen() {
  const { reloadAudit } = useApp();
  const { data, error, reload } = useApi<{ backups: { timestamp: string; files: string[]; size: number }[] }>("/api/trash");

  const onRestore = async (ts: string) => {
    try {
      const res = await api.post<any>(`/api/trash/${encodeURIComponent(ts)}/restore`);
      if (res.ok) {
        toast.success(`Restored snapshot ${ts}`);
        reload();
        reloadAudit();
      }
    } catch (err: any) {
      toast.error(`Restore failed: ${err.message}`);
    }
  };

  const onPurge = async (ts?: string) => {
    try {
      await api.post("/api/trash/purge", { timestamp: ts });
      toast.success(ts ? `Purged ${ts}` : "Purged all trash");
      reload();
    } catch (err: any) {
      toast.error(`Purge failed: ${err.message}`);
    }
  };

  if (!data) return <Page title="Trash"><Spinner label="Loading trash..." /></Page>;

  return (
    <Page
      title="Trash & Snapshots"
      meta="Automatic backups created before every atomic write mutation. Restore rolls files back instantly."
      actions={
        data.backups.length > 0 ? (
          <Button variant="danger" onClick={() => onPurge()}>Purge All</Button>
        ) : undefined
      }
    >
      {error && <ErrorNote what="Could not load backups" why={error.message} />}

      <div className="flex flex-col gap-3">
        {data.backups.length === 0 ? (
          <p className="text-xs text-ink-2">Trash is empty. No mutation backups exist.</p>
        ) : (
          data.backups.map((b) => (
            <div key={b.timestamp} className="flex items-center justify-between p-3 border border-line bg-surface rounded-[8px] text-xs">
              <div className="flex flex-col gap-1">
                <span className="mono font-semibold text-ink">{b.timestamp}</span>
                <span className="text-ink-2">
                  {b.files.length} file(s) ({bytes(b.size)}): <span className="mono">{b.files.join(", ")}</span>
                </span>
              </div>
              <div className="flex gap-2">
                <Button variant="primary" onClick={() => onRestore(b.timestamp)}>Restore</Button>
                <Button variant="ghost" onClick={() => onPurge(b.timestamp)}>Purge</Button>
              </div>
            </div>
          ))
        )}
      </div>
    </Page>
  );
}

export function ChangesScreen() {
  const { data, error } = useApi<{ changes: any[] }>("/api/changes");

  if (!data) return <Page title="Changes Log"><Spinner label="Loading changes..." /></Page>;

  return (
    <Page title="Audit Changelog" meta="Append-only log of every write mutation executed in this workspace.">
      {error && <ErrorNote what="Could not load changes" why={error.message} />}

      <div className="flex flex-col gap-3">
        {data.changes.length === 0 ? (
          <p className="text-xs text-ink-2">No mutations recorded yet.</p>
        ) : (
          data.changes.map((c, i) => (
            <div key={i} className="border border-line bg-surface rounded-[8px] p-3 text-xs flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-ink">{c.op}</span>
                <span className="mono text-ink-2 text-[11px]">{c.time}</span>
              </div>
              <div className="text-ink-2">
                Files: <span className="mono text-ink">{c.files?.join(", ")}</span>
                {c.ids?.length > 0 && <> · IDs: <span className="mono text-ink">{c.ids.join(", ")}</span></>}
              </div>
              {c.note && <div className="text-ink-2 italic">{c.note}</div>}
              {c.diff && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-accent text-[11px]">Show Diff</summary>
                  <pre className="mono text-[10px] mt-1 p-2 bg-surface-2 rounded max-h-40 overflow-auto whitespace-pre leading-snug">
                    {c.diff}
                  </pre>
                </details>
              )}
            </div>
          ))
        )}
      </div>
    </Page>
  );
}
