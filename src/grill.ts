import type { GrillAnswer, RepoProfile } from "./profile.ts";

export interface GrillOption {
  label: string;
  constrains: string[];
}

export interface GrillQuestion {
  qid: string;
  text: string;
  options: GrillOption[];
  scope: "repo" | "task";
}

export interface GrillCand {
  id: string;
  disambiguator: string;
  purpose: string;
}

function describe(c: GrillCand): string {
  return c.disambiguator || c.purpose;
}

export function buildInitQuestions(cands: GrillCand[], maxQ: number): GrillQuestion[] {
  if (cands.length < 2 || maxQ <= 0) return [];
  const sorted = [...cands].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const out: GrillQuestion[] = [];
  for (let i = 0; i + 1 < sorted.length && out.length < maxQ; i += 2) {
    const a = sorted[i];
    const b = sorted[i + 1];
    out.push({
      qid: `init:${a.id}-vs-${b.id}`,
      text: `Which matches your repo? 1) ${a.id}: ${describe(a)} 2) ${b.id}: ${describe(b)}`,
      options: [
        { label: a.id, constrains: [a.id] },
        { label: b.id, constrains: [b.id] },
      ],
      scope: "repo",
    });
  }
  return out;
}

export function applyGrillAnswer(p: RepoProfile, q: GrillQuestion, answerLabel: string): RepoProfile {
  const t = answerLabel.trim().toLowerCase();
  let opt: GrillOption | undefined;
  if (t === "1" || t === "2") {
    opt = q.options[Number(t) - 1];
  } else {
    opt = q.options.find((o) => o.label.toLowerCase() === t);
  }
  if (!opt) throw new Error(`grill: no option matches ${JSON.stringify(answerLabel)} for ${q.qid}`);
  const ans: GrillAnswer = {
    qid: q.qid,
    question: q.text,
    answer: opt.label,
    constrains: [...opt.constrains],
    ts: Date.now(),
  };
  const grill_answers = [...p.grill_answers.filter((g) => g.qid !== q.qid), ans];
  if (q.scope === "repo") {
    const have = new Set(p.mandatory.map((m) => m.id));
    const mandatory = [
      ...p.mandatory,
      ...opt.constrains.filter((id) => !have.has(id)).map((id) => ({ id, why: `grill:${q.qid}`, guard_bytes: 1800 })),
    ];
    return { ...p, mandatory, grill_answers };
  }
  const have = new Set(p.preferred.map((m) => m.id));
  const preferred = [
    ...p.preferred,
    ...opt.constrains.filter((id) => !have.has(id)).map((id) => ({ id, boost: 0.1 })),
  ];
  return { ...p, preferred, grill_answers };
}

function blankForDemo(): RepoProfile {
  return {
    version: 1,
    stack: [],
    signals_sha: "demo",
    mandatory: [],
    preferred: [],
    blocked: [],
    grill_answers: [],
    budget: { always_on_bytes: 2048, per_task_bytes: 20480 },
    updated_at: Date.now(),
  };
}

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`grill demo assert failed: ${msg}`);
}

if (import.meta.main) {
  const cands: GrillCand[] = [
    { id: "pocock__grill-with-docs", disambiguator: "Interviewing to sharpen a plan -> this.", purpose: "Sharpen a plan." },
    { id: "anthropic__frontend-design", disambiguator: "Doing visual/UI design -> this.", purpose: "Design UI." },
    { id: "local__strategic-memory", disambiguator: "", purpose: "Offline memory engine." },
    { id: "local__skill-router", disambiguator: "Resolving which skill fits -> this.", purpose: "Route a task." },
  ];
  const qs = buildInitQuestions(cands, 5);
  assert(qs.length === 2, `expected 2 questions, got ${qs.length}`);
  assert(qs[0].qid === "init:anthropic__frontend-design-vs-local__skill-router", `qid0 ${qs[0].qid}`);
  assert(qs[1].qid === "init:local__strategic-memory-vs-pocock__grill-with-docs", `qid1 ${qs[1].qid}`);
  assert(qs[1].text.includes("Offline memory engine."), "empty disambiguator falls back to purpose");

  const p0 = blankForDemo();
  const p1 = applyGrillAnswer(p0, qs[0], "1");
  assert(p0.grill_answers.length === 0 && p0.mandatory.length === 0, "input not mutated");
  assert(p1.mandatory.some((m) => m.id === "anthropic__frontend-design"), "mandatory got the pick");
  assert(p1.mandatory[0].why === `grill:${qs[0].qid}` && p1.mandatory[0].guard_bytes === 1800, "pin shape");

  const p2 = applyGrillAnswer(p1, qs[0], "2");
  assert(p2.grill_answers.length === 1, "re-answer replaces instead of duplicating");
  assert(p2.grill_answers[0].answer === "local__skill-router", "re-answer recorded");
  console.log(JSON.stringify({ questions: qs, profile: p2 }, null, 2));
  console.log("grill demo asserts passed");
}
