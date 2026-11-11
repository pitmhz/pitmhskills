import { useEffect, useRef } from "react";

type Handler = (e: KeyboardEvent) => void;

const typing = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));

/** Single-key shortcuts that stay quiet while the user types in a field. Esc always passes. */
export function useKeys(map: Record<string, Handler>, enabled = true) {
  const ref = useRef(map);
  ref.current = map;
  useEffect(() => {
    if (!enabled) return;
    const on = (e: KeyboardEvent) => {
      if (e.altKey || (e.ctrlKey && e.key !== "k") || (e.metaKey && e.key !== "k")) return;
      const key = (e.ctrlKey || e.metaKey ? "mod+" : "") + e.key;
      const h = ref.current[key];
      if (!h) return;
      if (key !== "Escape" && !key.startsWith("mod+") && typing(e.target)) return;
      e.preventDefault();
      h(e);
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [enabled]);
}
