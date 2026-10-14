import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";
import type { Signals } from "./types.ts";

export interface MandatoryPin {
  id: string;
  why: string;
  guard_bytes: number;
}

export interface PreferredBoost {
  id: string;
  boost: number;
}

export interface GrillAnswer {
  qid: string;
  question: string;
  answer: string;
  constrains: string[];
  ts: number;
}

export type PonytailMode = "lite" | "full" | "ultra" | "off";

export interface RepoProfile {
  version: 1;
  stack: string[];
  signals_sha: string;
  mandatory: MandatoryPin[];
  preferred: PreferredBoost[];
  blocked: string[];
  grill_answers: GrillAnswer[];
  budget: { always_on_bytes: number; per_task_bytes: number };
  ponytail_mode?: PonytailMode;
  updated_at: number;
}

export const PROFILE_NAME = ".pitmhskills/profile.json";

export function profilePath(cwd: string): string {
  return join(cwd, PROFILE_NAME);
}

export function loadProfile(cwd: string): RepoProfile | null {
  const p = profilePath(cwd);
  if (!existsSync(p)) return null;
  try {
    const raw = JSON.parse(readFileSync(p, "utf8")) as RepoProfile;
    return validateProfile(raw).length === 0 ? raw : null;
  } catch {
    return null;
  }
}

export function saveProfile(cwd: string, p: RepoProfile): void {
  p.updated_at = Date.now();
  mkdirSync(dirname(profilePath(cwd)), { recursive: true });
  writeFileSync(profilePath(cwd), JSON.stringify(p, null, 2) + "\n");
}

export function validateProfile(p: unknown): string[] {
  const errs: string[] = [];
  const o = p as Record<string, unknown>;
  if (!o || typeof o !== "object") return ["not an object"];
  if (o["version"] !== 1) errs.push("version must be 1");
  for (const f of ["stack", "mandatory", "preferred", "blocked", "grill_answers"]) {
    if (!Array.isArray(o[f])) errs.push(`missing ${f}`);
  }
  if (!o["signals_sha"]) errs.push("missing signals_sha");
  const b = o["budget"] as Record<string, unknown> | undefined;
  if (!b || typeof b["always_on_bytes"] !== "number" || typeof b["per_task_bytes"] !== "number") {
    errs.push("bad budget");
  }
  const pm = o["ponytail_mode"];
  if (pm !== undefined && pm !== "lite" && pm !== "full" && pm !== "ultra" && pm !== "off") {
    errs.push("bad ponytail_mode");
  }
  return errs;
}

export function computeSignalsHash(sig: Signals): string {
  return createHash("sha256").update(JSON.stringify({ s: sig.stack, f: sig.files })).digest("hex").slice(0, 16);
}

export function blankProfile(stack: string[], signals_sha: string): RepoProfile {
  return {
    version: 1,
    stack,
    signals_sha,
    mandatory: [],
    preferred: [],
    blocked: [],
    grill_answers: [],
    budget: { always_on_bytes: 2048, per_task_bytes: 20480 },
    updated_at: Date.now(),
  };
}
