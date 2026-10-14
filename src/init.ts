import type { Database } from "bun:sqlite";
import { openDb, initDb, loadConfig } from "./db.ts";
import { detectSignals } from "./signals.ts";
import { hardFilter } from "./gate.ts";
import { retrieve, loadAllCards } from "./retrieve.ts";
import { collapse } from "./collapse.ts";
import { scoreCandidates } from "./decide.ts";
import { loadProfile, saveProfile, blankProfile, computeSignalsHash } from "./profile.ts";
import type { RepoProfile, MandatoryPin } from "./profile.ts";
import { buildInitQuestions, applyGrillAnswer } from "./grill.ts";
import { buildMandate } from "./mandate.ts";
import type { Card, Signals } from "./types.ts";

const PROBES = [
  "remember user context across sessions",
  "review code changes before merging",
  "plan and specify work before implementing",
  "track engineering decisions",
];
const PIN_DOMAINS = ["memory", "workflow", "review"];
const GUARD_BYTES = 1800;
const MAX_PINS = 3;
const AMBIGUITY_MARGIN = 20;

type Ranking = { id: string; score: number; reason: string };

// One probe through the standard filter -> retrieve -> collapse -> score pipeline.
function rankProbe(
  db: Database,
  cards: Card[],
  sig: Signals,
  probe: string
): { ranking: Ranking[]; byId: Map<string, Card> } {
  const cfg = loadConfig();
  const { kept } = hardFilter(cards, probe, sig);
  const pool = kept.filter((c) => c.tier === "A" || c.tier === "B");
  const ranked = retrieve(db, probe, pool, cfg.top_k_retrieve as number);
  const collapsed = collapse(ranked, probe);
  return { ranking: scoreCandidates(collapsed, probe), byId: new Map(collapsed.map((r) => [r.card.id, r.card])) };
}

// Repo-wide probes: a skill scoring >= floor on a probe whose domain is
// memory/workflow/review becomes a mandatory pin. Cap 3, highest score first.
export function proposeMandatory(cards: Card[], sig: Signals): MandatoryPin[] {
  const floor = loadConfig().floor as number;
  const db = openDb();
  initDb(db);
  try {
    const best = new Map<string, { score: number; probe: string }>();
    for (const probe of PROBES) {
      const { ranking, byId } = rankProbe(db, cards, sig, probe);
      for (const r of ranking) {
        if (r.score < floor) continue;
        const dom = (byId.get(r.id)?.domain ?? "").toLowerCase();
        if (!PIN_DOMAINS.some((d) => dom.includes(d))) continue;
        if ((best.get(r.id)?.score ?? -1) < r.score) best.set(r.id, { score: r.score, probe });
      }
    }
    return [...best.entries()]
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, MAX_PINS)
      .map(([id, v]) => ({ id, why: `auto-probe:${v.probe}`, guard_bytes: GUARD_BYTES }));
  } finally {
    db.close();
  }
}

function askLine(q: string): string | null {
  try {
    return prompt(q);
  } catch {
    return null;
  }
}

export function runInit(cwd: string, opts: { refresh?: boolean }): RepoProfile {
  const sig = detectSignals(cwd);
  const sha = computeSignalsHash(sig);
  const existing = loadProfile(cwd);
  if (opts.refresh && existing && existing.signals_sha === sha) {
    console.log("profile fresh");
    return existing;
  }
  const maxQ = opts.refresh ? 1 : 5;
  const db = openDb();
  initDb(db);
  let pins: MandatoryPin[] = [];
  let cands: { id: string; disambiguator: string; purpose: string }[] = [];
  try {
    const cards = loadAllCards(db);
    pins = proposeMandatory(cards, sig);
    const seen = new Set<string>();
    for (const probe of PROBES) {
      const { ranking, byId } = rankProbe(db, cards, sig, probe);
      const top = ranking[0];
      const second = ranking[1];
      if (!top || !second || top.score - second.score >= AMBIGUITY_MARGIN) continue;
      for (const r of [top, second]) {
        if (seen.has(r.id)) continue;
        seen.add(r.id);
        const c = byId.get(r.id);
        if (c) cands.push({ id: c.id, disambiguator: c.disambiguator ?? "", purpose: c.purpose });
      }
    }
  } finally {
    db.close();
  }
  let p: RepoProfile = existing ?? blankProfile(sig.stack, sha);
  p.stack = sig.stack;
  p.signals_sha = sha;
  p.mandatory = pins;
  const asked = new Set(p.grill_answers.map((a) => a.qid));
  const questions = buildInitQuestions(cands, maxQ).filter((q) => !asked.has(q.qid)).slice(0, maxQ);
  for (const q of questions) {
    const menu = q.options.map((o, i) => `  ${i + 1}) ${o.label}`).join("\n");
    const raw = askLine(`${q.text}\n${menu}\nanswer (label or number): `);
    if (raw === null) continue;
    const t = raw.trim();
    if (!t) continue;
    const n = Number(t);
    const label = Number.isInteger(n) && n >= 1 && n <= q.options.length ? q.options[n - 1]!.label : t;
    try {
      p = applyGrillAnswer(p, q, label);
    } catch {
      console.log(`skipped: no option matches ${JSON.stringify(t)}`);
    }
  }
  saveProfile(cwd, p);
  const mandate = buildMandate(p);
  console.log(mandate);
  console.log(`mandate bytes=${Buffer.byteLength(mandate, "utf8")} mandatory=${p.mandatory.length} asked=${questions.length}`);
  return p;
}
