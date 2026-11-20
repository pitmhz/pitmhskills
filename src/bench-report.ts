// Metrics and text output for the bench harness.
// Pure helpers only: no router calls, no database. src/bench.ts does the running.
// LABELS_VERSION changes when the expected cards in evals/ change. It goes into
// the report meta and the text header so old and new numbers never mix.
export const LABELS_VERSION = "labels-v2";
/** hit: the exact expected card was offered. hitByAlternate: an accepted
 *  alternate card was offered. miss: neither. na: the case has no card. */
export type Hit = "hit" | "hitByAlternate" | "miss" | "na";
export interface BenchCase { task: string; expect: string; expect_any?: string[]; category: string; stack?: string[] }
export interface CaseResult {
  idx: number; corpus: string; outcome: string; skill_id: string | null; confidence: number; margin: number;
  candidates: { id: string; score: number }[]; bodyBytes: number; bodyWords: number; expect: string; expect_any: string[];
  hit: Hit; category: string; taskWords: number; latencyMs: number; must_delegate: boolean; proceed_bare_allowed: boolean;
  block_reason: string; expectRank: number | null; candGap: number | null;
}
export interface Metrics {
  n: number; top1n: number; top1: number; top1Strictn: number; top1Strict: number; hitByAlternate: number;
  picked: number; asked: number; abstained: number; falseAbstain: number; falseAbstainAbstain: number; falseAbstainAsk: number;
  falsePick: number; wrongPick: number; noneTotal: number; noneAbstain: number; nonePick: number; noneAsk: number;
  nonePrecision: number; expectInTop3: number; expectRouted: number; expectTop1: number; falseAbstainTop1: number;
  bodyNearCap: number; latP50: number; latP95: number; latMax: number; bodyP50: number; bodyP95: number;
  bodyMax: number; bodyAvg: number; bodyAtCap: number; bodyCount: number;
}
export interface Row {
  corpus: string; idx: number; expect: string; outcome: string; offered: string | null; confidence: number; margin: number;
  expectRank: number | null; top3: { id: string; score: number }[]; hit: Hit; alternates: string[];
}
export interface Stat { label: string; n: number; top1n: number; top1: number; top1Strictn: number; top1Strict: number;
  abstain: number; abstainRate: number; routed: number; expectTop1: number; expectInTop3: number }
export interface Check { checked: number; mismatches: number; detail: string[] }
export interface Report {
  meta: { cwd: string; generated_at: string; corpus_filter: string | null; route_calls: number; labels_version: string };
  overall: Metrics; corpora: { name: string; file: string; n: number; metrics: Metrics }[]; buckets: Stat[]; categories: Stat[];
  worstCards: { id: string; fail: number; n: number; notInTop3: number; rightFirst: number; altHit: number }[];
  near_miss: Row[]; close_rows: Row[];
  close_margin: { n: number; ask: number; pick: number; abstain: number; askRate: number; top1n: number };
  failures: { false_abstain: Row[]; wrong_pick: Row[]; false_pick: Row[]; hit_by_alternate: Row[] };
  determinism: { second_pass: Check; reverse: Check }; results: CaseResult[];
}
function pctl(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[i]!;
}
/** Classify one case. A hit needs a PICK. A listed alternate is a hit too, but it is counted apart. */
export function classify(outcome: string, offered: string | null, expect: string, expectAny: string[]): Hit {
  if (expect === "NONE") return "na";
  if (outcome !== "PICK") return "miss";
  if (offered === expect) return "hit";
  if (offered && expectAny.includes(offered)) return "hitByAlternate";
  return "miss";
}
/** Hit class of a result, recomputed from the raw fields. */
function hitOf(r: CaseResult): Hit { return classify(r.outcome, r.skill_id, r.expect, r.expect_any); }
/** All counters for one set of cases. */
export function metrics(rs: CaseResult[]): Metrics {
  const n = rs.length;
  const cnt = (f: (r: CaseResult) => boolean) => rs.filter(f).length;
  const picked = rs.filter((r) => r.outcome === "PICK");
  const routed = rs.filter((r) => r.expect !== "NONE"), none = rs.filter((r) => r.expect === "NONE");
  const fa = routed.filter((r) => r.outcome !== "PICK");
  const lat = rs.map((r) => r.latencyMs).sort((a, b) => a - b);
  const bod = rs.filter((r) => r.bodyBytes > 0).map((r) => r.bodyBytes).sort((a, b) => a - b);
  const strict = cnt((r) => hitOf(r) === "hit");
  const alt = cnt((r) => hitOf(r) === "hitByAlternate");
  const top1n = strict + alt;
  return {
    n, top1n, top1: n ? top1n / n : 0, top1Strictn: strict, top1Strict: n ? strict / n : 0, hitByAlternate: alt,
    picked: picked.length, asked: cnt((r) => r.outcome === "ASK"), abstained: cnt((r) => r.outcome === "ABSTAIN"),
    falseAbstain: fa.length, falseAbstainAbstain: fa.filter((r) => r.outcome === "ABSTAIN").length,
    falseAbstainAsk: fa.filter((r) => r.outcome === "ASK").length, falsePick: cnt((r) => r.outcome === "PICK" && r.expect === "NONE"),
    wrongPick: cnt((r) => r.outcome === "PICK" && hitOf(r) === "miss"),
    noneTotal: none.length, noneAbstain: none.filter((r) => r.outcome === "ABSTAIN").length,
    nonePick: none.filter((r) => r.outcome === "PICK").length, noneAsk: none.filter((r) => r.outcome === "ASK").length,
    nonePrecision: none.length ? none.filter((r) => r.outcome === "ABSTAIN").length / none.length : 1,
    expectInTop3: routed.filter((r) => r.expectRank !== null).length, expectRouted: routed.length,
    expectTop1: routed.filter((r) => r.expectRank === 1).length, falseAbstainTop1: fa.filter((r) => r.expectRank === 1).length,
    latP50: pctl(lat, 50), latP95: pctl(lat, 95), latMax: lat.length ? lat[lat.length - 1]! : 0,
    bodyP50: pctl(bod, 50), bodyP95: pctl(bod, 95), bodyMax: bod.length ? bod[bod.length - 1]! : 0, bodyCount: bod.length,
    bodyAvg: bod.length ? bod.reduce((a, b) => a + b, 0) / bod.length : 0, bodyAtCap: bod.filter((b) => b >= 3000).length,
    bodyNearCap: bod.filter((b) => b >= 2950).length,
  };
}
/** One report row for a case. The expect id can be overridden (notes table). */
export function rowFor(r: CaseResult, expectOverride?: string): Row {
  const expect = expectOverride ?? r.expect;
  const at = r.candidates.findIndex((c) => c.id === expect);
  return { corpus: r.corpus, idx: r.idx, expect, outcome: r.outcome, offered: r.skill_id, confidence: r.confidence,
    margin: r.margin, expectRank: expect === "NONE" || at < 0 ? null : at + 1, top3: r.candidates,
    hit: classify(r.outcome, r.skill_id, expect, r.expect_any), alternates: r.expect_any };
}
export function bucketOf(words: number): string {
  return words < 60 ? "00-59" : words < 80 ? "60-79" : words < 100 ? "80-99" : words < 120 ? "100-119" : "120+";
}
/** Build the full report object. The JSON file and the text report use it. */
export function buildReport(o: {
  cwd: string; corpusFilter: string | null; routeCalls: number; labelsVersion?: string;
  corpora: { name: string; file: string; cases: BenchCase[]; results: CaseResult[] }[];
  nearMiss: Map<string, Map<number, string>>; determinism: { second_pass: Check; reverse: Check };
}): Report {
  const all = o.corpora.flatMap((c) => c.results);
  const grp = (key: (r: CaseResult) => string, order: string[]): Stat[] => {
    const map = new Map<string, CaseResult[]>();
    for (const r of all) map.set(key(r), [...(map.get(key(r)) ?? []), r]);
    return order.filter((k) => map.has(k)).map((k) => {
      const rs = map.get(k)!; const n = rs.length;
      const t1 = rs.filter((r) => hitOf(r) === "hit" || hitOf(r) === "hitByAlternate").length;
      const st = rs.filter((r) => hitOf(r) === "hit").length;
      const ab = rs.filter((r) => r.outcome === "ABSTAIN").length;
      const rt = rs.filter((r) => r.expect !== "NONE");
      return { label: k, n, top1n: t1, top1: n ? t1 / n : 0, top1Strictn: st, top1Strict: n ? st / n : 0, abstain: ab,
        abstainRate: n ? ab / n : 0, routed: rt.length, expectTop1: rt.filter((r) => r.expectRank === 1).length,
        expectInTop3: rt.filter((r) => r.expectRank !== null).length };
    });
  };
  // Worst expected cards. A case satisfied by an accepted alternate is not a failure of the expected card.
  const cards = new Map<string, { n: number; fail: number; notInTop3: number; rightFirst: number; altHit: number }>();
  for (const r of all) {
    if (r.expect === "NONE") continue;
    const s = cards.get(r.expect) ?? { n: 0, fail: 0, notInTop3: 0, rightFirst: 0, altHit: 0 };
    s.n++;
    if (r.hit === "miss") { s.fail++; if (r.expectRank === null) s.notInTop3++; }
    if (r.expectRank === 1 && r.outcome !== "PICK") s.rightFirst++;
    cards.set(r.expect, s);
    if (r.hit === "hitByAlternate" && r.skill_id && cards.has(r.skill_id)) cards.get(r.skill_id)!.altHit++;
  }
  const near_miss: Row[] = [];  for (const c of o.corpora) for (const [idx, expect] of o.nearMiss.get(c.name) ?? []) {
    const r = c.results.find((x) => x.idx === idx);
    if (r) near_miss.push(rowFor(r, expect));
  }
  const close = all.filter((r) => r.candGap !== null && r.candGap < 10);
  const pick = (rs: CaseResult[]) => rs.filter((r) => r.outcome === "PICK").length;
  const ask = (rs: CaseResult[]) => rs.filter((r) => r.outcome === "ASK").length;
  return {
    meta: { cwd: o.cwd, generated_at: new Date().toISOString(), corpus_filter: o.corpusFilter,
      route_calls: o.routeCalls, labels_version: o.labelsVersion ?? LABELS_VERSION },
    overall: metrics(all),
    corpora: o.corpora.map((c) => ({ name: c.name, file: c.file, n: c.results.length, metrics: metrics(c.results) })),
    buckets: grp((r) => bucketOf(r.taskWords), ["00-59", "60-79", "80-99", "100-119", "120+"]),
    categories: grp((r) => r.category, [...new Set(all.map((r) => r.category))].sort()),
    worstCards: [...cards.entries()].map(([id, s]) => ({ id, fail: s.fail, n: s.n, notInTop3: s.notInTop3,
      rightFirst: s.rightFirst, altHit: s.altHit }))
      .sort((a, b) => b.fail - a.fail || b.notInTop3 - a.notInTop3 || a.id.localeCompare(b.id)).slice(0, 15),
    near_miss, close_rows: close.map((r) => rowFor(r)),
    close_margin: { n: close.length, ask: ask(close), pick: pick(close), abstain: close.length - ask(close) - pick(close),
      askRate: close.length ? ask(close) / close.length : 0,
      top1n: close.filter((r) => hitOf(r) === "hit" || hitOf(r) === "hitByAlternate").length },
    failures: {
      false_abstain: all.filter((r) => r.outcome !== "PICK" && r.expect !== "NONE").map((r) => rowFor(r)),
      wrong_pick: all.filter((r) => r.outcome === "PICK" && r.hit === "miss").map((r) => rowFor(r)),
      false_pick: all.filter((r) => r.outcome === "PICK" && r.expect === "NONE").map((r) => rowFor(r)),
      hit_by_alternate: all.filter((r) => r.hit === "hitByAlternate").map((r) => rowFor(r)) },
    determinism: o.determinism, results: all,
  };
}
const r1 = (n: number, d: number): string => (d ? `${n}/${d} ${(100 * n / d).toFixed(1)}%` : "0/0 0.0%");
const f1 = (n: number): string => n.toFixed(1);
function mlines(m: Metrics, p: string): string[] {
  return [
    `${p} n ${m.n}`, `${p} top1 ${r1(m.top1n, m.n)} (hit + hitByAlternate)`, `${p} top1Strict ${r1(m.top1Strictn, m.n)} (exact expect)`,
    `${p} top1 on routed ${r1(m.top1n, m.expectRouted)}`, `${p} hitByAlternate ${r1(m.hitByAlternate, m.expectRouted)}`,
    `${p} picked ${r1(m.picked, m.n)}`, `${p} asked ${r1(m.asked, m.n)}`,
    `${p} abstained ${r1(m.abstained, m.n)}`, `${p} falseAbstain ${r1(m.falseAbstain, m.expectRouted)} (abstain ${m.falseAbstainAbstain} ask ${m.falseAbstainAsk})`,
    `${p} falsePick ${r1(m.falsePick, m.noneTotal)}`, `${p} wrongPick ${r1(m.wrongPick, m.expectRouted)}`,
    `${p} nonePrecision ${r1(m.noneAbstain, m.noneTotal)} (abstain ${m.noneAbstain} pick ${m.nonePick} ask ${m.noneAsk})`,
    `${p} expectInTop3 ${r1(m.expectInTop3, m.expectRouted)}`,
    `${p} expectTop1 ${r1(m.expectTop1, m.expectRouted)} (right card was candidate 1) falseAbstainWithRightCardFirst ${r1(m.falseAbstainTop1, m.falseAbstain)}`,
    `${p} latency p50 ${f1(m.latP50)} p95 ${f1(m.latP95)} max ${f1(m.latMax)} ms`,
    `${p} body p50 ${m.bodyP50} p95 ${m.bodyP95} max ${m.bodyMax} avg ${f1(m.bodyAvg)} atCap ${m.bodyAtCap}/${m.bodyCount} nearCap ${m.bodyNearCap}/${m.bodyCount}`,
  ];
}
function rowLine(r: Row): string {
  const rank = r.expectRank === null ? "rank not in top3" : `rank ${r.expectRank}`;
  const t3 = r.top3.map((c) => `${c.id}:${c.score}`).join(" ");
  return `${r.corpus}#${r.idx} expect=${r.expect} outcome=${r.outcome} offered=${r.offered ?? "NONE"} hit=${r.hit}` +
    (r.alternates.length ? ` alternates=[${r.alternates.join(",")}]` : "") + ` conf=${f1(r.confidence)} margin=${f1(r.margin)} ${rank} top3=[${t3}]`;
}
/** Plain text report. One metric per line, no box drawing. */
export function formatText(rep: Report): string {
  const L: string[] = ["BENCH REPORT", `cwd ${rep.meta.cwd}`, `generated ${rep.meta.generated_at}`, `labels ${rep.meta.labels_version}`,
    `route calls ${rep.meta.route_calls} (session bench, lock false, log false)`, `corpora ${rep.corpora.map((c) => `${c.name}=${c.n}`).join(" ")}`,
    "", "OVERALL", ...mlines(rep.overall, "overall"), ""];
  for (const c of rep.corpora) L.push(`CORPUS ${c.name}`, `corpus file ${c.file}`, ...mlines(c.metrics, "corpus"), "");
  L.push("WORD LENGTH BUCKETS");
  for (const b of rep.buckets) L.push(`bucket ${b.label} n ${b.n} top1 ${r1(b.top1n, b.n)} top1Strict ${r1(b.top1Strictn, b.n)} abstain ${r1(b.abstain, b.n)} expectTop1 ${r1(b.expectTop1, b.routed)} expectInTop3 ${r1(b.expectInTop3, b.routed)}`);
  L.push("", "PER CATEGORY");
  for (const c of rep.categories) L.push(`category ${c.label} n ${c.n} top1 ${r1(c.top1n, c.n)} top1Strict ${r1(c.top1Strictn, c.n)} abstain ${r1(c.abstain, c.n)} expectTop1 ${r1(c.expectTop1, c.routed)} expectInTop3 ${r1(c.expectInTop3, c.routed)}`);
  L.push("", "PER CASE");  for (const r of rep.results) L.push(`${r.corpus}#${r.idx} expect=${r.expect} offered=${r.skill_id ?? "NONE"} outcome=${r.outcome} hit=${r.hit}${r.expect_any.length ? ` alternates=[${r.expect_any.join(",")}]` : ""}`);
  L.push("", "WORST EXPECTED CARDS");  for (const w of rep.worstCards) L.push(`card ${w.id} fail ${w.fail}/${w.n} notInTop3 ${w.notInTop3} rightCardFirst ${w.rightFirst} altHit ${w.altHit}`);
  const nmHits = rep.near_miss.filter((r) => r.hit === "hit" || r.hit === "hitByAlternate").length;  L.push("", "NEAR MISS FROM NOTES", `near-miss cases ${rep.near_miss.length} top1 ${r1(nmHits, rep.near_miss.length)}`);  for (const r of rep.near_miss) L.push(rowLine(r));
  const cm = rep.close_margin;  L.push("", "CLOSE CANDIDATES (top two within 10 points)", `close n ${cm.n} ask ${cm.ask} pick ${cm.pick} abstain ${cm.abstain} askRate ${r1(cm.ask, cm.n)} top1 ${r1(cm.top1n, cm.n)}`);  for (const r of rep.close_rows) L.push(rowLine(r));
  L.push("", "DETERMINISM", `second pass same order checked ${rep.determinism.second_pass.checked} mismatches ${rep.determinism.second_pass.mismatches}`);  for (const d of rep.determinism.second_pass.detail) L.push(`second pass mismatch ${d}`);
  L.push(`reverse order checked ${rep.determinism.reverse.checked} mismatches ${rep.determinism.reverse.mismatches}`);
  for (const d of rep.determinism.reverse.detail) L.push(`reverse mismatch ${d}`);
  const failGroups: [string, Row[]][] = [["FALSE ABSTAIN", rep.failures.false_abstain], ["WRONG PICK", rep.failures.wrong_pick],
    ["FALSE PICK", rep.failures.false_pick], ["HIT BY ALTERNATE", rep.failures.hit_by_alternate]];
  for (const [tag, rows] of failGroups) { L.push("", `${tag} ${rows.length}`); for (const r of rows) L.push(rowLine(r)); }
  return L.join("\n");
}
