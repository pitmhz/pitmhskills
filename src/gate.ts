import type { Card, Signals } from "./types.ts";
import type { RepoProfile } from "./profile.ts";

// Hard filter before retrieval: tier gate + requires + do_not_use_when lexical hit.
export function hardFilter(cards: Card[], task: string, sig: Signals, profile?: RepoProfile | null): { kept: Card[]; dropped: { id: string; why: string }[] } {
  const kept: Card[] = [];
  const dropped: { id: string; why: string }[] = [];
  const tl = task.toLowerCase();
  const tokens = new Set(tl.split(/[^a-z0-9]+/).filter((t) => t.length > 2));
  for (const c of cards) {
    if (c.tier === "C") { dropped.push({ id: c.id, why: "tier-C frozen" }); continue; }
    const req = c.requires;
    if (req?.stack_any?.length) {
      const hit = req.stack_any.some((s) => sig.stack.includes(s.toLowerCase()));
      // empty signals = unknown repo: do not drop, retrieval decides
      if (sig.stack.length > 0 && !hit) { dropped.push({ id: c.id, why: "requires stack miss" }); continue; }
    }
    if (req?.files_any?.length) {
      const hit = req.files_any.some((f) => sig.files.some((sf) => sf.endsWith(f)));
      if (sig.files.length > 0 && !hit) { dropped.push({ id: c.id, why: "requires files miss" }); continue; }
    }
    const negHit = c.do_not_use_when.some((w) => {
      const words = w.toLowerCase().split(/[^a-z0-9]+/).filter((x) => x.length > 3);
      return words.length > 0 && words.every((x) => tokens.has(x) || tl.includes(x));
    });
    if (negHit) { dropped.push({ id: c.id, why: "do_not_use_when hit" }); continue; }
    if (profile?.blocked?.includes(c.id)) { dropped.push({ id: c.id, why: "profile blocked" }); continue; }
    kept.push(c);
  }
  return { kept, dropped };
}
