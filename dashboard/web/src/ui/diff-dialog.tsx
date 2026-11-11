import { Button } from "./controls.tsx";
import { Modal } from "./overlay.tsx";

export type DiffDialogProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  diffs: { file: string; patch: string }[];
  willRun?: string[];
  warnings?: string[];
  loading?: boolean;
};

export function DiffDialog({ open, onClose, onConfirm, title, diffs, willRun = [], warnings = [], loading }: DiffDialogProps) {
  return (
    <Modal open={open} onClose={onClose} title={title} wide>
      <div className="flex flex-col gap-4 text-[13px]">
        {warnings.length > 0 && (
          <div className="rounded-[6px] border border-warn/40 bg-warn/10 p-2.5 text-warn text-xs">
            {warnings.map((w, i) => <div key={i}>⚠️ {w}</div>)}
          </div>
        )}

        <div className="flex flex-col gap-2 max-h-[50vh] overflow-auto">
          {diffs.map((d, i) => (
            <div key={i} className="rounded-[6px] border border-line bg-surface-2 p-2">
              <div className="mono font-semibold text-xs mb-1.5 text-ink">{d.file}</div>
              <pre className="mono text-[11px] overflow-x-auto whitespace-pre leading-snug">
                {d.patch.split("\n").map((line, idx) => {
                  let colorCls = "text-ink-2";
                  if (line.startsWith("+") && !line.startsWith("+++")) colorCls = "text-ok font-semibold bg-ok/10";
                  else if (line.startsWith("-") && !line.startsWith("---")) colorCls = "text-bad font-semibold bg-bad/10";
                  else if (line.startsWith("@@")) colorCls = "text-accent";
                  return <div key={idx} className={colorCls}>{line}</div>;
                })}
              </pre>
            </div>
          ))}
        </div>

        {willRun.length > 0 && (
          <div className="text-xs text-ink-2">
            <span className="font-semibold text-ink">Post-steps to run: </span>
            {willRun.join(" → ")}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-line">
          <Button variant="ghost" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button variant="primary" onClick={onConfirm} disabled={loading}>
            {loading ? "Applying..." : "Confirm & Apply"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
