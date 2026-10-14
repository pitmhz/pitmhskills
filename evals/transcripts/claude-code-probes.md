# D1 Stage 1 — Claude Code hook probes (transcript evidence)

Date (UTC): 2026-10-14. Repo: C:\Users\Mattchine\pitmhskills (Bun+TS, Windows pwsh).
Mechanism under test: `hooks/route-hook.ps1` / `hooks/route-hook.sh` (UserPromptSubmit hook: deterministic route before model sees prompt). Zero manual commands: hook runs automatically on prompt submit; evidence below was captured by invoking the hook script directly with the probe text as its only argument (no `/` command, no skill pick).

## Client config state (read-only inspection, NOT edited)
- `C:\Users\Mattchine\.claude\settings.json` contains ONLY an `rtk hook claude` PreToolUse/Bash block. There is NO pitmhskills UserPromptSubmit hook block registered.
- No paste-ready pitmhskills snippet for Claude settings was found anywhere in the repo or plan docs (searched: `UserPromptSubmit|mcp.json` → only hit is the comment header in `hooks/route-hook.sh`). Per D1 risk rule (inspect → backup → minimal additive edit, never guess formats), the settings file was LEFT UNTOUCHED. Registering the hook block in Settings is still an open step for the owner.

## Hook fix applied this stage (allowed: hooks/ read/fix on probe failure; backups kept)
- Probe 1 initially FAILED via the hook: `route-hook.ps1 "remember my project preferences across sessions"` returned ABSTAIN (top supabase__supabase 34 < floor) instead of cavemem.
- Root cause: `src/cli.ts` positional-arg parsing appends trailing flags into the task string (`args.slice(1).join(" ")` only strips LEADING `--flag` tokens), so `route "$Task" --cwd <path>` pollutes the task with `--cwd <path>` and depresses the score. Proven: same probe via `route --task "..."` → PICK local__cavemem 69; via MCP `tools/call` (clean task argument) → PICK local__cavemem 69.
- Fix (minimal, hook-only; NO router code touched): pass the task with the explicit flag form.
  - `hooks/route-hook.ps1`: `& bun "$dir/src/cli.ts" route "$Task" --cwd ...` → `& bun "$dir/src/cli.ts" route --task "$Task" --cwd ...`
  - `hooks/route-hook.sh`: `bun "$DIR/src/cli.ts" route "$TASK" --cwd ...` → `bun "$DIR/src/cli.ts" route --task "$TASK" --cwd ...`
  - Backups: `hooks/route-hook.ps1.bak`, `hooks/route-hook.sh.bak` (pre-fix copies).
- CLI `src/cli.ts` arg-parsing bug itself was NOT fixed (out of scope: no router code this stage). Flagged for a later stage.

## Probe 1 — memory → expect cavemem (AFTER fix)
Command: `powershell -NoProfile -ExecutionPolicy Bypass -File hooks/route-hook.ps1 "remember my project preferences across sessions"` (cwd = repo root)
```
OUTCOME: PICK
SKILL: local__cavemem
CONFIDENCE: 69 MARGIN: 30
WHY: matches "Persistent memory support. Use when the user asks to remember, store, or retriev" | session locked to ponytail__ponytail — call phase_done first
LOCKED: false
SCOPE: Only touch files the task names; everything else read-only.
--- body ---
STYLE: no delve,tapestry,landscape,vibrant,testament,beacon,realm,symphony,pivotal,crucial. No banned phrases/openers. Full list: get_ref slop-patterns.
---
name: cavemem
description: Persistent memory support. Use when the user asks to remember, store, or retrieve context across sessions.
---

# Cavemem Persistent Memory

Use the Cavemem memory tools when available to store or retrieve persistent memory.

## Rules
- Preserve user-specific context and preferences across turns.
- Store noteworthy facts, constraints, and project details when relevant.
- Retrieve prior memory before answering if the context may depend on earlier sessions.
- Do not invent memory entries; only store facts the user provided or confirmed.
- Before work that depends on history, run `python server/scripts/memory_navigator.py search` with distilled technical keywords. It searches observations, summaries, checkpoints, promoted memories, ADRs, and git digests.
- After context compaction, prefer the latest project-scoped checkpoint, then inspect related summaries or raw observations only as needed.
- Treat `<private>...</private>` content and credential-shaped values as non-memory; Cavemem redacts them before storage.
```
Result: PASS (mechanism routes to cavemem, zero manual steps). Note: `session locked to ponytail__ponytail` is default-session lock contamination from earlier probes in this shell, not a routing failure — outcome/skill/confidence are correct. BEFORE-fix output for the record: `OUTCOME: ABSTAIN, SKILL: NONE, CONFIDENCE: 34, WHY: top supabase__supabase score 34 < floor`.

## Probe 2 — grill → expect grill-with-docs (AFTER fix)
Command: `powershell -NoProfile -ExecutionPolicy Bypass -File hooks/route-hook.ps1 "grill my deployment plan with interview questions"`
```
OUTCOME: PICK
SKILL: pocock__grill-with-docs
CONFIDENCE: 91 MARGIN: 46
WHY: matches "A relentless interview to sharpen a plan or design, creating ADRs and glossary d" | session locked to ponytail__ponytail — call phase_done first
LOCKED: false
SCOPE: Only touch files the task names; everything else read-only.
--- body ---
STYLE: no delve,tapestry,landscape,vibrant,testament,beacon,realm,symphony,pivotal,crucial. No banned phrases/openers. Full list: get_ref slop-patterns.
---
name: grill-with-docs
description: A relentless interview to sharpen a plan or design, which also creates docs (ADR's and glossary) as we go.
disable-model-invocation: true
---

Call the Skill tool twice, for "grilling" and "domain-modeling".
```
Result: PASS (zero manual steps).

## Probe 3 — typo → expect ABSTAIN (AFTER fix)
Command: `powershell -NoProfile -ExecutionPolicy Bypass -File hooks/route-hook.ps1 "fix a typo in the readme"`
```
OUTCOME: ABSTAIN
SKILL: NONE
CONFIDENCE: 54 MARGIN: 0
WHY: top local__skill-router score 54 < floor
LOCKED: false
SCOPE: Only touch files the task names.
```
Result: PASS (proceeds bare, zero manual steps).

## MCP handshake transcript (shared stdio transport, `src/serve.ts`)
Stdin (4 JSON-RPC lines piped, no manual skill pick):
```
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}
{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}
{"jsonrpc":"2.0","id":10,"method":"tools/call","params":{"name":"route","arguments":{"task":"remember my project preferences across sessions","cwd":"C:/Users/Mattchine/pitmhskills"}}}
{"jsonrpc":"2.0","id":11,"method":"tools/call","params":{"name":"route","arguments":{"task":"grill my deployment plan with interview questions","cwd":"C:/Users/Mattchine/pitmhskills"}}}
{"jsonrpc":"2.0","id":12,"method":"tools/call","params":{"name":"route","arguments":{"task":"fix a typo in the readme","cwd":"C:/Users/Mattchine/pitmhskills"}}}
```
Stdout (verbatim):
```
{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2024-11-05","capabilities":{"tools":{}},"serverInfo":{"name":"pitmhskills","version":"0.1.0"}}}
{"jsonrpc":"2.0","id":2,"result":{"tools":[{"name":"route","description":"Route a task to exactly one skill or ABSTAIN","inputSchema":{"type":"object","properties":{"task":{"type":"string"},"cwd":{"type":"string"}},"required":["task"]}},{"name":"get_ref","description":"Fetch an extra reference file from a skill","inputSchema":{"type":"object","properties":{"skill_id":{"type":"string"},"path":{"type":"string"}},"required":["skill_id","path"]}},{"name":"phase_done","description":"Close current phase, run gates","inputSchema":{"type":"object","properties":{"session_id":{"type":"string"}},"required":["session_id"]}}]}}
{"jsonrpc":"2.0","id":10,"result":{"content":[{"type":"text","text":"{\n  \"outcome\": \"PICK\",\n  \"skill_id\": \"local__cavemem\",\n  \"confidence\": 69,\n  \"margin\": 30, ...}"}]}}
{"jsonrpc":"2.0","id":11,"result":{"content":[{"type":"text","text":"{\n  \"outcome\": \"PICK\",\n  \"skill_id\": \"pocock__grill-with-docs\",\n  \"confidence\": 91,\n  \"margin\": 46, ...}"}]}}
{"jsonrpc":"2.0","id":12,"result":{"content":[{"type":"text","text":"{\n  \"outcome\": \"ABSTAIN\",\n  \"skill_id\": null,\n  \"confidence\": 54,\n  \"margin\": 0, ...}"}]}}
```
(Full JSON bodies for ids 10–12 match the probe outcomes above: cavemem 69 / grill-with-docs 91 / ABSTAIN 54. Complete raw lines retained in shell history; key fields quoted verbatim.)

## Verdict: UNVERIFIED (blocking reason)
Hook script mechanics: 3/3 PASS after fix, zero manual commands. BUT end-to-end Claude Code client wiring is UNVERIFIED because: (1) no pitmhskills hook block exists in `~/.claude/settings.json` (only `rtk hook claude`), and the correct JSON shape was not found in-repo so it was not guessed; (2) no fresh Claude Code session could be spawned from this subagent to prove zero-manual behavior in the real client. Next step for owner: register `hooks/route-hook.ps1` (Windows) as a UserPromptSubmit hook in Claude settings, then re-run these 3 probes verbatim in a fresh session.
