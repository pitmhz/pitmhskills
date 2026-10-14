import type { RankedCard } from "./types.ts";

// Cluster collapse: one candidate per cluster. Variant wins only if its
// pick_over_primary_when predicate matches the task (keyword check, cached deterministic).
export function collapse(ranked: RankedCard[], task: string): RankedCard[] {
  const tl = task.toLowerCase();
  const byCluster = new Map<string, RankedCard[]>();
  for (const r of ranked) {
    const key = r.card.cluster?.trim() || `__solo:${r.card.id}`;
    if (!byCluster.has(key)) byCluster.set(key, []);
    byCluster.get(key)!.push(r);
  }
  const out: RankedCard[] = [];
  for (const group of byCluster.values()) {
    if (group.length === 1) { out.push(group[0]!); continue; }
    const primary = group.find((g) => g.card.cluster_role !== "variant") ?? group[0]!;
    const variants = group.filter((g) => g.card.cluster_role === "variant");
    let winner: RankedCard = primary;
    // Token-exact predicate match: substring matching ("help" in "helper",
    // "typo" in "typography") fires on unrelated tasks and hijacks the cluster.
    const taskTokens = new Set(tl.split(/[^a-z0-9]+/).filter((w) => w.length > 0));
    for (const v of variants) {
      const cond = (v.card.pick_over_primary_when ?? "").toLowerCase();
      if (!cond) continue;
      const keys = cond.split(/[^a-z0-9]+/).filter((w) => w.length > 3);
      const hit = keys.length > 0 && keys.some((k) => taskTokens.has(k));
      // Explicit routing intent beats generic text mass: a predicate hit earns
      // fused bonus so the niche variant survives collapse against a primary
      // whose large generic text would otherwise always win the window.
      if (hit) v.fused += 0.6;
      if (hit && v.fused > winner.fused - 0.5) { winner = v; break; }
    }
    out.push(winner);
  }
  return out.sort((a, b) => b.fused - a.fused);
}
