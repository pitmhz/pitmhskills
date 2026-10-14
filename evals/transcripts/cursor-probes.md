# D1 Stage 1 — Cursor MCP + rules probes (transcript evidence)

Date (UTC): 2026-10-14. Repo: C:\Users\Mattchine\pitmhskills (Bun+TS, Windows pwsh).
Mechanism under test: Cursor MCP server (stdio `src/serve.ts`: `route`/`get_ref`/`phase_done`) + Cursor rules mandating a route call before acting. Zero manual commands means: the agent calls the MCP `route` tool with the raw task text; the model never picks a skill by hand.

## Client config state (read-only inspection, NOT edited)
- `~/.cursor\hooks.json` exists but contains ONLY an `rtk hook cursor` preToolUse/Shell block — no pitmhskills entry.
- No Cursor `mcp.json` for pitmhskills was found (searched `%USERPROFILE%` depth 3; only hits: repo-internal `skills/cloudflare/mcp.json` sample and an unrelated `portfolio/.vscode/mcp.json`). No `.cursor-rules` / `.cursor/rules` for pitmhskills in `$HOME` or the repo.
- No paste-ready Cursor snippet was found in the repo or plan docs. Per D1 risk rule (never guess formats — stop and report if unclear), NO Cursor config was created or edited. Wiring the MCP server entry + rules text is still an open step for the owner.

## Probes (via the exact MCP transport Cursor would use: piped JSON-RPC to `bun src/serve.ts`, cwd `C:/Users/Mattchine/pitmhskills`)
Single piped session, 5 lines in (initialize → tools/list → 3× tools/call route), zero manual skill picks. Command:
```powershell
$lines = @(
 '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}',
 '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}',
 '{"jsonrpc":"2.0","id":10,"method":"tools/call","params":{"name":"route","arguments":{"task":"remember my project preferences across sessions","cwd":"C:/Users/Mattchine/pitmhskills"}}}',
 '{"jsonrpc":"2.0","id":11,"method":"tools/call","params":{"name":"route","arguments":{"task":"grill my deployment plan with interview questions","cwd":"C:/Users/Mattchine/pitmhskills"}}}',
 '{"jsonrpc":"2.0","id":12,"method":"tools/call","params":{"name":"route","arguments":{"task":"fix a typo in the readme","cwd":"C:/Users/Mattchine/pitmhskills"}}}'
); $lines | bun src/serve.ts
```

### Handshake (verbatim stdout, ids 1–2)
```
{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2024-11-05","capabilities":{"tools":{}},"serverInfo":{"name":"pitmhskills","version":"0.1.0"}}}
{"jsonrpc":"2.0","id":2,"result":{"tools":[{"name":"route","description":"Route a task to exactly one skill or ABSTAIN","inputSchema":{"type":"object","properties":{"task":{"type":"string"},"cwd":{"type":"string"}},"required":["task"]}},{"name":"get_ref","description":"Fetch an extra reference file from a skill","inputSchema":{"type":"object","properties":{"skill_id":{"type":"string"},"path":{"type":"string"}},"required":["skill_id","path"]}},{"name":"phase_done","description":"Close current phase, run gates","inputSchema":{"type":"object","properties":{"session_id":{"type":"string"}},"required":["session_id"]}}]}}
```

### Probe 1 — memory → expect cavemem (id 10, verbatim)
```
{"jsonrpc":"2.0","id":10,"result":{"content":[{"type":"text","text":"{\n  \"outcome\": \"PICK\",\n  \"skill_id\": \"local__cavemem\",\n  \"confidence\": 69,\n  \"margin\": 30,\n  \"scope_fence\": \"Only touch files the task names; everything else read-only.\",\n  \"why\": \"matches \\\"Persistent memory support. Use when the user asks to remember, store, or retriev\\\"\",\n  \"candidates\": [{\"id\": \"local__cavemem\", \"score\": 69}, {\"id\": \"supabase__supabase\", \"score\": 39}, {\"id\": \"anthropic__web-artifacts-builder\", \"score\": 36}],\n  \"locked\": true\n}"}]}}
```
(body header: `name: cavemem / description: Persistent memory support...`, full cavemem Rules block returned, matching the claude-code probe body.) Result: PASS.

### Probe 2 — grill → expect grill-with-docs (id 11, verbatim key fields)
- `outcome: PICK`, `skill_id: pocock__grill-with-docs`, `confidence: 91`, `margin: 46`, body = grill-with-docs card (`disable-model-invocation: true`, "Call the Skill tool twice..."). Note: `why` carries `| session locked to local__cavemem — call phase_done first` + `locked: false` because ids 10–12 share MCP session "mcp" and probe 1 locked it — outcome/skill/score unaffected. Result: PASS.

### Probe 3 — typo → expect ABSTAIN (id 12, verbatim key fields)
- `outcome: ABSTAIN`, `skill_id: null`, `confidence: 54`, `why: top local__skill-router score 54 < floor`. Result: PASS (proceeds bare).

## Cross-check via hook script (shared `hooks/` fix this stage)
The same 3 probes via fixed `hooks/route-hook.ps1` (which now uses `route --task "$Task"`): cavemem 69 / grill-with-docs 91 / ABSTAIN 54 — all PASS, zero manual steps. Before the fix, probe 1 returned ABSTAIN (34) because CLI positional-arg parsing polluted the task with `--cwd <path>`; fix + backups (`hooks/route-hook.ps1.bak`, `hooks/route-hook.sh.bak`) documented in `claude-code-probes.md`. `src/cli.ts` itself NOT touched (out of scope).

## Verdict: UNVERIFIED (blocking reason)
MCP transport mechanics: 3/3 PASS (initialize → tools/list → tools/call route, zero manual commands). BUT end-to-end Cursor wiring is UNVERIFIED because: (1) no Cursor `mcp.json` entry or rules text for pitmhskills exists on this machine and the correct format was not verifiable in-repo, so nothing was written; (2) no fresh Cursor session could be spawned from this subagent to prove zero-manual behavior in the real client. Next step for owner: add the pitmhskills stdio MCP server (`bun C:/Users/Mattchine/pitmhskills/src/serve.ts`) to Cursor `mcp.json` plus a route-before-act rule, then re-run these 3 probes verbatim in a fresh session.
