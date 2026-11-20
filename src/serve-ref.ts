import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve, sep, isAbsolute } from "node:path";

// get_ref logic split from serve.ts for the 200-line cap.
// Fetches an extra reference file from a skill, or one SECTIONS section.
export function fetchRef(skill_id: string, path: string): { content: { type: "text"; text: string }[] } {
  if (isAbsolute(path) || /^[a-zA-Z]:/.test(path) || path.startsWith("/") || path.startsWith("\\")) {
    throw new Error("ref not found");
  }
  const base = skill_id.replace(/[^a-zA-Z0-9_-]/g, "");
  const cardPath = `cards/${base}.json`;
  if (!existsSync(cardPath)) throw new Error("unknown skill");
  const card = JSON.parse(readFileSync(cardPath, "utf8")) as { skill_path?: string; sections?: { name: string }[] };
  if (!card.skill_path) throw new Error("ref not found");
  const skillDir = resolve(dirname(card.skill_path));
  const full = resolve(skillDir, path);
  if (full !== skillDir && !full.startsWith(skillDir + sep)) throw new Error("ref not found");
  if (existsSync(full)) {
    try {
      const text = readFileSync(full, "utf8");
      return { content: [{ type: "text", text: text.slice(0, 20000) }] };
    } catch { /* not a file: try section lookup below */ }
  }
  let skillText = "";
  try { if (existsSync(card.skill_path)) skillText = readFileSync(card.skill_path, "utf8"); } catch { skillText = ""; }
  const want = path.trim().toLowerCase();
  const avail: string[] = [];
  if (skillText) {
    const parts = skillText.split(/^## /m);
    if (parts.length > 1) {
      const canon = new Map((card.sections ?? []).map((m) => [m.name.toLowerCase(), m.name]));
      for (const sec of parts.slice(1)) {
        const first = (sec.split("\n", 1)[0] ?? "").replace(/\s+#+\s*$/, "").trim();
        const label = canon.get(first.toLowerCase()) ?? first;
        avail.push(label);
        if (label.toLowerCase() === want || first.toLowerCase() === want) {
          const body = sec.slice((sec.split("\n", 1)[0] ?? "").length);
          return { content: [{ type: "text", text: `## ${label}\n${body}` }] };
        }
      }
    } else {
      const paras = skillText.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
      for (const [i, p] of paras.slice(1, 6).entries()) {
        const label = (p.slice(0, 40).replace(/\s+/g, " ").trim()) || `Part ${i + 1}`;
        avail.push(label);
        if (label.toLowerCase() === want) return { content: [{ type: "text", text: p }] };
      }
    }
  }
  const list = avail.length ? `§${avail.join(" §")}` : "(no sections in this skill)";
  return { content: [{ type: "text", text: `unknown section "${path}". Available: ${list}` }] };
}
