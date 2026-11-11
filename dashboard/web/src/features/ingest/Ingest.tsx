import { useState } from "react";
import { toast } from "sonner";
import { api } from "../../lib/api.ts";
import { useApp } from "../../lib/ctx.tsx";
import { bytes, num } from "../../lib/format.ts";
import { Page } from "../../shell.tsx";
import { Button, ErrorNote, Input, Panel, Spinner } from "../../ui/controls.tsx";

export function IngestWizard() {
  const { reloadAudit } = useApp();
  const [url, setUrl] = useState("https://github.com/");
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [committing, setCommitting] = useState(false);

  const onPreview = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setPreview(null);
    try {
      const res = await api.post<any>("/api/ingest/preview", { url });
      setPreview(res);
      const validIds = new Set<string>(
        res.skills.filter((s: any) => !s.duplicate_of && !s.collision && s.valid).map((s: any) => s.id)
      );
      setSelected(validIds);
      toast.success(`Found ${res.count} skills in repo`);
    } catch (err: any) {
      toast.error(`Preview failed: ${err.message || err.body?.error}`);
    } finally {
      setLoading(false);
    }
  };

  const onCommit = async () => {
    if (!preview || !selected.size) return;
    setCommitting(true);
    try {
      const selectedSkills = preview.skills.filter((s: any) => selected.has(s.id));
      const res = await api.post<any>("/api/ingest/commit", {
        clone_id: preview.clone_id,
        selected_skills: selectedSkills,
      });
      if (res.ok) {
        toast.success(`Successfully imported ${selectedSkills.length} skills into Tier C`);
        setPreview(null);
        setSelected(new Set());
        reloadAudit();
      } else {
        toast.error(`Commit reverted: ${res.error}`);
      }
    } catch (err: any) {
      toast.error(`Commit failed: ${err.message || err.body?.error}`);
    } finally {
      setCommitting(false);
    }
  };

  return (
    <Page title="Ingest Wizard" meta="3-step import wizard: preview clone, filter exclusions, commit as Tier C with provenance.">
      <Panel title="Step 1: Source Repository">
        <form onSubmit={onPreview} className="flex gap-2">
          <Input
            aria-label="GitHub Repository URL"
            className="flex-1"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://github.com/owner/repo"
          />
          <Button variant="primary" type="submit" disabled={loading}>
            {loading ? "Cloning & Scanning..." : "Preview Skills"}
          </Button>
        </form>
      </Panel>

      {loading && <Spinner label="Cloning repository shallowly into temporary workspace..." />}

      {preview && (
        <Panel
          title={`Step 2 & 3: Review (${selected.size} selected of ${preview.count})`}
          actions={
            <Button variant="primary" onClick={onCommit} disabled={committing || !selected.size}>
              {committing ? "Importing..." : `Commit ${selected.size} Skills`}
            </Button>
          }
        >
          <div className="flex flex-col gap-3">
            <p className="text-xs text-ink-2">
              Import destination: <span className="mono text-ink">cards/</span> · Default tier: <span className="mono text-ink font-semibold">Tier C (staged)</span>
            </p>

            <table className="dtable">
              <thead>
                <tr>
                  <th className="w-8"></th>
                  <th>Skill ID</th>
                  <th>Size</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {preview.skills.map((s: any) => (
                  <tr key={s.id} onClick={() => {
                    const next = new Set(selected);
                    next.has(s.id) ? next.delete(s.id) : next.add(s.id);
                    setSelected(next);
                  }}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.has(s.id)}
                        onChange={() => {}}
                        className="accent-[var(--accent)]"
                      />
                    </td>
                    <td className="mono text-xs">{s.id}</td>
                    <td className="mono text-xs text-ink-2">{bytes(s.bytes)}</td>
                    <td className="text-xs">
                      {s.duplicate_of ? (
                        <span className="text-warn">Duplicate of {s.duplicate_of}</span>
                      ) : s.collision ? (
                        <span className="text-bad">Collision with existing ID</span>
                      ) : !s.valid ? (
                        <span className="text-bad">Invalid frontmatter</span>
                      ) : (
                        <span className="text-ok">Ready</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </Page>
  );
}
