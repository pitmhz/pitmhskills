import { useEffect, useState } from "react";

// 30-line hash router: #/screen?key=value. Filters live in the hash so a view is linkable.
export type Loc = { screen: string; params: URLSearchParams };

function parse(): Loc {
  const raw = location.hash.replace(/^#\/?/, "");
  const [screen, query] = raw.split("?");
  return { screen: screen || "overview", params: new URLSearchParams(query ?? "") };
}

export function useLoc(): Loc {
  const [loc, setLoc] = useState(parse);
  useEffect(() => {
    const on = () => setLoc(parse());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return loc;
}

export function href(screen: string, params?: Record<string, string | number | undefined | null>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  const s = q.toString();
  return `#/${screen}${s ? `?${s}` : ""}`;
}

export const go = (screen: string, params?: Record<string, string | number | undefined | null>) => {
  location.hash = href(screen, params);
};

/** Replace one param in the current hash without adding a history entry per keystroke. */
export function setParam(loc: Loc, patch: Record<string, string | number | undefined | null>) {
  const p = Object.fromEntries(loc.params.entries()) as Record<string, string | number | undefined | null>;
  history.replaceState(null, "", href(loc.screen, { ...p, ...patch }));
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}
