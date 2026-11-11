import { createPatch } from "diff";
import { existsSync, readFileSync } from "node:fs";
import { safePath, repoRel } from "../adapter/repo.ts";

export type FileDiff = { file: string; before: string; after: string; patch: string };

/** Computes unified diff for a file without mutating disk. */
export function diffFile(relPath: string, newContent: string): FileDiff {
  const full = safePath(relPath);
  const oldContent = existsSync(full) ? readFileSync(full, "utf8") : "";
  const patch = createPatch(repoRel(full), oldContent, newContent, "before", "after");
  return { file: repoRel(full), before: oldContent, after: newContent, patch };
}
