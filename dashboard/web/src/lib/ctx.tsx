import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useApi, type Audit, type Capabilities } from "./api.ts";

type Ctx = {
  caps: Capabilities | null;
  audit: Audit | null;
  reloadAudit: () => void;
  slice: string;
  setSlice: (s: string) => void;
};

const AppCtx = createContext<Ctx | null>(null);

/** Capabilities are read once at start and drive all gating; the slice selector remembers the last slice. */
export function AppProvider({ children }: { children: ReactNode }) {
  const caps = useApi<Capabilities>("/api/capabilities");
  const audit = useApi<Audit>("/api/audit");
  const [slice, setSliceState] = useState(() => localStorage.getItem("dash.slice") ?? "All");
  const setSlice = (s: string) => {
    localStorage.setItem("dash.slice", s);
    setSliceState(s);
  };
  // Byte measurement runs in the background on the server; poll audit only while it is running.
  useEffect(() => {
    if (!audit.data?.measuring) return;
    const t = setTimeout(audit.reload, 4000);
    return () => clearTimeout(t);
  }, [audit.data, audit.reload]);
  return (
    <AppCtx.Provider value={{ caps: caps.data, audit: audit.data, reloadAudit: audit.reload, slice, setSlice }}>
      {children}
    </AppCtx.Provider>
  );
}

export function useApp(): Ctx {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp outside AppProvider");
  return c;
}

/** A control whose flag is false renders disabled with a one-line reason. */
export function useFlag(name: string): { on: boolean; reason: string } {
  const { caps } = useApp();
  const on = !!caps?.flags[name];
  return { on, reason: on ? "" : `Disabled: ${name} is false in RECON.md.` };
}
