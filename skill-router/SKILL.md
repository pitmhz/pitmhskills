---
name: skill-router
description: Deterministic skill resolver. Routes a task to exactly one registered skill, or runs a council of subagents when the top candidates are close. Use before any specialized task.
---

# Skill Router

The skill library has 1400+ registered skills. Reading the directory to find
one is how agents end up loading five irrelevant skills and forgetting all of
them. The router is the index. Use it, do not browse.

## Route First

One call. It returns `PICK`, `ASK`, or `ABSTAIN`.

**MCP tool (preferred - works from any directory):**

```
route(task="<the user's request in their own words>", cwd="<current working directory>")
```

**Shell (same router, no MCP):**

```powershell
bun C:\Users\Mattchine\pitmhskills\src\cli.ts route "<task or topic>" --cwd (Get-Location).Path
```

**Shell (unix):**

```bash
bun ~/pitmhskills/src/cli.ts route "<task or topic>" --cwd "$PWD"
```

**Last resort only** (when bun and the MCP tool are both unavailable):

```bash
python server/scripts/resolve_skill.py "<task or topic>"
```

`resolve_skill.py` delegates to the same router. It only uses its own
synonym matcher when the router cannot run at all.

## Read The Result

| Outcome | What to do |
| --- | --- |
| `PICK` | Load that one skill body. Nothing else. |
| `ASK` | Ask the user to pick 1 or 2, then load that one skill. |
| `ABSTAIN` | No skill applies. Work bare. Do not go hunting. |

The `candidates` list in the result is context, not a work list. Do not read
those bodies. They lost.

## Hard Rules

- **One skill body per phase.** If a second skill is needed, the router
  returns it as a distilled `PAIRED CORE` guard, not a second body.
- **Never list, glob, or grep the skills directory.** The router is the
  index. Grepping is how nvidia, cloudflare and postgres skills end up in a
  web-design task.
- **Trust the scores over your own reading.** The router sees the whole
  library; you see one file. If a skill looks plausible but the router did
  not pick it, the router is right.
- **ABSTAIN is a real answer.** It means no registered skill fits. Proceed
  bare instead of reading around it.

## Contested Tasks: The Council

When `route` returns `ASK`, or when the top candidates are close, do not read
several bodies yourself. Run the council: each candidate goes to its own
reader, the verdicts land in a temporary memory, and one direction comes
back.

```
1. council(task="<task>", cwd="<cwd>")
   -> { id, plan: [ {skill_id, role, prompt}, ... ] }
   The plan holds one brief per candidate plus one critic brief. Each
   specialist brief carries exactly ONE skill body.

2. Spawn one subagent per brief. Max 3 running at a time, queue the rest.
   Each subagent reads only its own skill and writes a verdict back:
     note(id="<id>", skill_id="<skill_id>", verdict="keep|drop|merge",
          evidence="one line, under 120 chars")
   Evidence goes to the temp memory, not to your context.

3. compose(id="<id>")
   -> { skill_id, brief, dissent, confidence }
   ONE skill, ONE merged brief, and the list of what was dropped and why.

4. Use the composed brief only. Do not read the other bodies.
```

Verdicts:

- `keep` - this skill answers the task.
- `drop` - off-target. Say why in one line.
- `merge` - right, but only as a complement. Say what to take from it.

A candidate with no verdict is dropped. Silence is not consent. The council
memory expires 30 minutes after it opens, so never reuse an old `id`.

## Memory Skills

If the routed skill is `memory-navigator`, `strategic-memory` or `cavemem`,
follow it into the project memory:

```bash
python -m server.pitmry context "<concrete question>"
```
