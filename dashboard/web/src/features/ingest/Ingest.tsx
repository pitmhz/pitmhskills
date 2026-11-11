import { useState } from "react";
import { toast } from "sonner";
import { api } from "../../lib/api.ts";
import { useApp } from "../../lib/ctx.tsx";
import { bytes } from "../../lib/format.ts";
import { Page } from "../../shell.tsx";
import { Button, Input, Panel, Spinner } from "../../ui/controls.tsx";

export function IngestWizard() {
  const { reloadAudit } = useApp();
  const [url, setUrl] = useState("https://github.com/");
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [committing, setCommitting] = useState(false);

  const onPreview = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setPreview(null);
    try {
      const res = await api.post<any>("/api/ingest/preview", { url });
      setPreview(res);
      setSelected(new Set(res.skills.filter((s: any) => !s.duplicate_of && !s.collision && s.valid).map((s: any) => s.id)));
      toast.success(`Found ${res.count} skills`);
    } catch (err: any) { toast.error(`Preview failed: ${err.message}`); } finally { setLoading(false); }
  };

  const onCommit = async () => {
    if (!preview || !selected.size) return;
    setCommitting(true);
    try {
      const selectedSkills = preview.skills.filter((s: any) => selected.has(s.id));
      const res = await api.post<any>("/api/ingest/commit", { clone_id: preview.clone_id, selected_skills: selectedSkills });
      if (res.ok) { toast.success(`Imported ${selectedSkills.length} skills`); setPreview(null); reloadAudit(); }
      else toast.error(`Commit failed: ${res.error}`);
    } catch (err: any) { toast.error(`Commit failed: ${err.message}`); } finally { setCommitting(false); }
  };

  return (
    <Page title="Ingest Wizard" meta="Import from GitHub repo into Tier C with provenance.">
      <Panel title="Step 1: Source Repository">
        <form onSubmit={onPreview} className="flex gap-2">
          <Input aria-label="GitHub Repo URL" className="flex-1" value={url} onChange={(e) => setUrl(e.target.value)} />
          <Button variant="primary" type="submit" disabled={loading}>{loading ? "Scanning..." : "Preview"}</Button>
        </form>
      </Panel>
      {loading && <Spinner label="Cloning repository shallowly..." />}
      {preview && (
        <Panel title={`Review (${selected.size}/${preview.count})`} actions={<Button variant="primary" onClick={onCommit} disabled={committing || !selected.size}>{committing ? "Importing..." : "Commit"}</Button>}>
          <table className="dtable">
            <thead><tr><th className="w-8"></th><th>Skill ID</th><th>Size</th><th>Status</th></tr></thead>
            <tbody>
              {preview.skills.map((s: any) => (
                <tr key={s.id} onClick={() => { const next = new Set(selected); next.has(s.id) ? next.delete(s.id) : next.add(s.id); setSelected(next); }}>
                  <td><input type="checkbox" checked={selected.has(s.id)} onChange={() => {}} className="accent-[var(--accent)]" /></td>
                  <td className="mono text-xs">{s.id}</td><td className="mono text-xs text-ink-2">{bytes(s.bytes)}</td>
                  <td className="text-xs">{s.duplicate_of ? <span className="text-warn">Duplicate</span> : s.collision ? <span className="text-bad">Collision</span> : <span className="text-ok">Ready</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </Page>
  );
}
