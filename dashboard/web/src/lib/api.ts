import { useCallback, useEffect, useRef, useState } from "react";

const token = () => document.querySelector<HTMLMetaElement>('meta[name="dash-token"]')?.content ?? "";

export type ApiError = { error: string; why?: string; next?: string; detail?: string; blocked_by?: string };

export class HttpError extends Error {
  status: number;
  body: ApiError;
  constructor(status: number, body: ApiError) {
    super(body.error || `HTTP ${status}`);
    this.status = status;
    this.body = body;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { "content-type": "application/json", "x-dash-token": token() },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok) throw new HttpError(res.status, json as ApiError);
  return json as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
};

/** Tiny fetch hook: data, error, loading, reload. No caching library by design. */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<HttpError | null>(null);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);
  const load = useCallback(() => {
    if (!path) return;
    const n = ++seq.current;
    setLoading(true);
    api.get<T>(path)
      .then((d) => { if (n === seq.current) { setData(d); setError(null); } })
      .catch((e: HttpError) => { if (n === seq.current) setError(e); })
      .finally(() => { if (n === seq.current) setLoading(false); });
  }, [path]);
  useEffect(load, [load]);
  return { data, error, loading, reload: load };
}

// Shapes shared with the server.
export type Flags = Record<string, boolean>;
export type Field = { name: string; type: string; required: boolean; observed: number; options?: string[] };
export type Capabilities = { flags: Flags; slice_key: string; slices: string[]; schema: Field[]; mandate_mode: string; router_cmd: string[] };
export type Row = {
  id: string; tier: string; domain: string; cluster: string; role: string; bytes: number;
  license: string; provenance: boolean; state: "ok" | "stale" | "invalid"; purpose: string;
};
export type Page = { rows: Row[]; total: number; page: number; pages: number; size: number };
export type Audit = {
  total: number; tiers: Record<string, number>; returnable: number; frozen: number; no_provenance: number;
  returnable_no_provenance: number; stale: number; stale_a: number; invalid: number;
  validator: { code: number; at: string; excerpt: string[] };
  always_on: { min: number; max: number; files: { file: string; bytes: number }[] };
  budget: { always_on_target: number; always_on_cap: number; max_bytes: number | null; avg_bytes_target: number | null; max_skills_per_task: number | null };
  per_task: { avg: number; max: number; skills: number; n: number; at: string; stale: boolean } | null;
  abstention: { rate: number; n: number } | null;
  measuring: boolean;
  bench: { at: string; top1: number; nonePrecision: number; n: number } | null;
};
export type Pick = { id: string; score: number | null; tier?: string; cluster?: string; reason?: string; bytes?: number };
export type RouteResult = {
  outcome: "PICK" | "ASK" | "ABSTAIN" | "LEGACY_LIST"; picks: Pick[]; question?: string;
  dropped?: { id: string; why: string }[]; bytes_total: number | null; skills_loaded: number; raw_excerpt: string;
  confidence?: number; margin?: number; why?: string; paired?: string | null; ms: number;
};
