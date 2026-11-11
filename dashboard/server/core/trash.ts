import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { STATE, safePath, ROOT, repoRel } from "../adapter/repo.ts";

const TRASH_DIR = join(STATE, "trash");
mkdirSync(TRASH_DIR, { recursive: true });

export type BackupInfo = { timestamp: string; files: string[]; size: number; path: string };

/** Back up affected files to .state/trash/<timestamp>/ preserving relative paths. */
export function backupFiles(relPaths: string[]): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const destDir = join(TRASH_DIR, ts);
  mkdirSync(destDir, { recursive: true });

  for (const rel of relPaths) {
    const srcFull = safePath(rel);
    if (!existsSync(srcFull)) continue;
    const destFull = join(destDir, rel);
    mkdirSync(dirname(destFull), { recursive: true });
    copyFileSync(srcFull, destFull);
  }
  return ts;
}

/** Restore files from backup directory back to the repo root. */
export function restoreBackup(ts: string): string[] {
  const backupDir = join(TRASH_DIR, ts);
  if (!existsSync(backupDir)) throw new Error(`Backup not found: ${ts}`);

  const restored: string[] = [];
  function restoreRec(curr: string) {
    for (const f of readdirSync(curr)) {
      const p = join(curr, f);
      if (statSync(p).isDirectory()) {
        restoreRec(p);
      } else {
        const rel = relative(backupDir, p);
        const destFull = safePath(rel);
        mkdirSync(dirname(destFull), { recursive: true });
        copyFileSync(p, destFull);
        restored.push(repoRel(destFull));
      }
    }
  }
  restoreRec(backupDir);
  return restored;
}

/** List available backup snapshots in Trash. */
export function listTrash(): BackupInfo[] {
  if (!existsSync(TRASH_DIR)) return [];
  const entries = readdirSync(TRASH_DIR).filter((d) => statSync(join(TRASH_DIR, d)).isDirectory());
  const list: BackupInfo[] = [];

  for (const ts of entries) {
    const dir = join(TRASH_DIR, ts);
    const files: string[] = [];
    let size = 0;

    function walk(curr: string) {
      for (const f of readdirSync(curr)) {
        const p = join(curr, f);
        const st = statSync(p);
        if (st.isDirectory()) walk(p);
        else {
          files.push(relative(dir, p).split("\\").join("/"));
          size += st.size;
        }
      }
    }
    walk(dir);
    list.push({ timestamp: ts, files, size, path: dir });
  }
  return list.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

/** Purge a specific backup directory or all backups. */
export function purgeTrash(ts?: string): void {
  if (ts) {
    const dir = join(TRASH_DIR, ts);
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  } else {
    rmSync(TRASH_DIR, { recursive: true, force: true });
    mkdirSync(TRASH_DIR, { recursive: true });
  }
}
