// Plain text report for the router analytics. One metric per line.
// No box drawing, no tables: the output is read in a terminal.
import type { Aggregate } from "./analytics-agg.ts";

const f1 = (n: number) => (Math.round(n * 10) / 10).toString();
const fpct = (n: number) => `${(n * 100).toFixed(1)}%`;

export function formatAnalytics(a: Aggregate): string {
  const L: string[] = [];
  L.push(`window days=${a.window.days}`);
  L.push(`offers total=${a.offers.total}`);
  L.push(`outcome PICK=${a.offers.byOutcome.PICK} ASK=${a.offers.byOutcome.ASK} ABSTAIN=${a.offers.byOutcome.ABSTAIN}`);
  L.push(`pick rate=${fpct(a.offers.pickRate)}`);
  L.push(`ask rate=${fpct(a.offers.askRate)}`);
  L.push(`abstain rate=${fpct(a.offers.abstainRate)}`);
  L.push(`usage rows=${a.usage.total}`);
  L.push(`accepted=${a.usage.acceptedCount}`);
  L.push(`acceptance rate=${fpct(a.acceptanceRate)}`);
  L.push(`latency p50=${f1(a.latency.p50)}ms p95=${f1(a.latency.p95)}ms max=${f1(a.latency.max)}ms`);
  L.push(`body bytes p50=${a.bodyBytes.p50} p95=${a.bodyBytes.p95} max=${a.bodyBytes.max} avg=${f1(a.bodyBytes.avg)}`);
  L.push(`decisions without offer=${a.decisionsWithoutOffer}`);
  L.push(`skills by offers (top 10):`);
  if (!a.bySkill.length) L.push("  none");
  for (const s of a.bySkill.slice(0, 10)) {
    L.push(`  skill ${s.id} offers=${s.offers} accepted=${s.accepted} acceptRate=${fpct(s.acceptRate)} confAccepted=${f1(s.avgConfidenceAccepted)} confRejected=${f1(s.avgConfidenceRejected)}`);
  }
  L.push(`dropped skills (top 10):`);
  if (!a.dropped.length) L.push("  none");
  for (const d of a.dropped.slice(0, 10)) {
    L.push(`  dropped ${d.id} offers=${d.offers} rejected=${d.rejected} rejectRate=${fpct(d.rejectRate)}`);
  }
  L.push(`sources by offers (top 10):`);
  if (!a.bySource.length) L.push("  none");
  for (const s of a.bySource.slice(0, 10)) {
    L.push(`  source ${s.provider} offers=${s.offers} accepted=${s.accepted} acceptRate=${fpct(s.acceptRate)}`);
  }
  return L.join("\n");
}
