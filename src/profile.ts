import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
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

export const MandatoryPinSchema = z.object({ id: z.string(), why: z.string(), guard_bytes: z.number() });
export const PreferredBoostSchema = z.object({ id: z.string(), boost: z.number() });
export const GrillAnswerSchema = z.object({
  qid: z.string(),
  question: z.string(),
  answer: z.string(),
  constrains: z.array(z.string()),
  ts: z.number(),
});
export const RepoProfileSchema = z.object({
  version: z.literal(1),
  stack: z.array(z.string()),
  signals_sha: z.string().min(1),
  mandatory: z.array(MandatoryPinSchema),
  preferred: z.array(PreferredBoostSchema),
  blocked: z.array(z.string()),
  grill_answers: z.array(GrillAnswerSchema),
  budget: z.object({ always_on_bytes: z.number(), per_task_bytes: z.number() }),
  ponytail_mode: z.enum(["lite", "full", "ultra", "off"]).optional(),
  updated_at: z.number().optional(),
});

export function validateProfile(p: unknown): string[] {
  if (!p || typeof p !== "object") return ["not an object"];
  const r = RepoProfileSchema.safeParse(p);
  if (r.success) return [];
  const out: string[] = [];
  for (const issue of r.error.issues) {
    const top = String(issue.path[0] ?? "");
    if (top === "version") {
      if (!out.includes("version must be 1")) out.push("version must be 1");
    } else if (["stack", "mandatory", "preferred", "blocked", "grill_answers"].includes(top)) {
      const tag = `missing ${top}`;
      if (!out.includes(tag)) out.push(tag);
    } else if (top === "signals_sha") {
      if (!out.includes("missing signals_sha")) out.push("missing signals_sha");
    } else if (top === "budget") {
      if (!out.includes("bad budget")) out.push("bad budget");
    } else if (top === "ponytail_mode") {
      if (!out.includes("bad ponytail_mode")) out.push("bad ponytail_mode");
    } else {
      out.push(`${top || "value"}: ${issue.message}`);
    }
  }
  return out;
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
