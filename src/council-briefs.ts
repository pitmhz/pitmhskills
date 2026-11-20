import type { Card } from "./types.ts";
import type { ShortlistEntry } from "./council.ts";
import { DELIVER_CAP } from "./deliver.ts";

// The briefs a subagent receives.
//
// Each specialist brief carries exactly ONE skill body. That is the point:
// the reader is small, the verdict is specific, and the body never has to be
// carried in the caller's context. The critic brief carries no body at all -
// it judges the routing list, not the skills.

const NOTE_FORMAT = [
  "Write your verdict to the temp memory, not to the chat:",
  '  note(deliberation_id="{{ID}}", skill_id="{{SKILL}}", verdict="keep|drop|merge", evidence="one line, under 120 chars")',
  "Evidence rule: evidence must quote a short verbatim phrase from the skill body in double quotes, e.g. evidence=\"builds a X\". Copy the words exactly; do not paraphrase.",
  "verdict meanings:",
  "  keep  - this skill answers the task; say which parts of it matter",
  "  drop  - this skill is off-target for this task; say why in one line",
  "  merge - this skill is right but only as a complement; say what to take from it",
].join("\n");

export function specialistPrompt(task: string, id: string, entry: ShortlistEntry, body: string): string {
  const card: Card = entry.card;
  const lines = [
    `TASK: ${task}`,
    `YOUR SKILL: ${card.id} (read this one skill only)`,
    `PURPOSE: ${card.purpose}`,
  ];
  if (card.goal) lines.push(`GOAL: ${card.goal}`);
  if (card.disambiguator) lines.push(`WHEN IT APPLIES: ${card.disambiguator}`);
  if (card.use_when.length) lines.push(`USE WHEN: ${card.use_when.slice(0, 3).join(" | ")}`);
  const whenToUse = card.when_to_use?.length ? card.when_to_use : card.use_when;
  if (whenToUse.length) lines.push(`WHEN TO USE: ${whenToUse.slice(0, 2).join(" | ")}`);
  if (card.do_not_use_when.length) lines.push(`NOT FOR: ${card.do_not_use_when.slice(0, 2).join(" | ")}`);
  lines.push(`ROUTING SCORE: ${entry.score} (deterministic guess, not a verdict)`);
  lines.push("", "SKILL BODY:", body.slice(0, DELIVER_CAP), "");
  lines.push(NOTE_FORMAT.replaceAll("{{ID}}", id).replaceAll("{{SKILL}}", card.id));
  return lines.join("\n");
}

export function criticPrompt(task: string, id: string, entries: ShortlistEntry[]): string {
  const lines = [
    `TASK: ${task}`,
    `YOUR ROLE: critic. You do NOT read a skill body. You see the routing list and judge which candidate is on target.`,
    "",
    "CANDIDATES:",
  ];
  for (const e of entries) {
    const goal = e.card.goal ?? "";
    const wtu = (e.card.when_to_use?.length ? e.card.when_to_use : e.card.use_when).slice(0, 2).join(" | ");
    lines.push(`  ${e.card.id}  score=${e.score}  goal=${goal.slice(0, 120)}`);
    lines.push(`      purpose: ${e.card.purpose.slice(0, 110)}`);
    if (wtu) lines.push(`      when_to_use: ${wtu.slice(0, 120)}`);
    if (e.card.disambiguator) lines.push(`      when: ${e.card.disambiguator.slice(0, 110)}`);
  }
  lines.push("", "Pick the ONE candidate that best answers the task, or say none fits.");
  lines.push("Write a short verdict for each candidate:", NOTE_FORMAT.replaceAll("{{ID}}", id).replaceAll("{{SKILL}}", "<skill_id>"));
  return lines.join("\n");
}
