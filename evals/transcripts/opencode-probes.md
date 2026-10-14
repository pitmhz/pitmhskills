# D1 Stage 1 — opencode MCP probes (transcript evidence)

Date (UTC): 2026-10-14. Repo: C:\Users\Mattchine\pitmhskills (Bun+TS, Windows pwsh).
Mechanism under test: opencode MCP server `pitmhskills` (local stdio). Zero manual commands means: the agent calls the MCP `route` tool with the raw task text; no `/` command, no manual skill selection.

## Client config state (read-only inspection, NOT edited — already registered, re-verify only per D1)
`~/.config/opencode/opencode.jsonc` already contains:
```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "servers": {
      "pitmhskills": {
        "type": "local",
        "command": ["bun", "C:/Users/Mattchine/pitmhskills/src/serve.ts"]
      },
      "obscura": { "type": "local", "command": ["C:\\Users\\Mattchine\\obscura\\obscura.exe", "mcp", "--stealth"] }
    }
  }
}
```
No edit was needed or made (D1: opencode MCP already registered — re-verify only).

## Live MCP proof in this session
This subagent session itself is an opencode session governed by `pitmhskills/AGENTS.md` ("Before any coding task, call the `route` tool with the user's task"). Compliance transcript:
- Called `tools.pitmhskills.route` with the D1 wiring task before any repo inspection.
- Router returned `ABSTAIN` (top supabase__supabase 47 < floor), so work proceeded bare without loading any skill body — the mandated zero-manual path working as designed.

## Probes (exact MCP stdio transport the opencode client uses)
Command (cwd = repo root):
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

### Probe 1 — memory → expect cavemem (id 10)
- `outcome: PICK`, `skill_id: local__cavemem`, `confidence: 69`, `margin: 30`, `locked: true`, full cavemem body (Persistent Memory Rules block). Result: PASS, zero manual commands.

### Probe 2 — grill → expect grill-with-docs (id 11)
- `outcome: PICK`, `skill_id: pocock__grill-with-docs`, `confidence: 91`, `margin: 46` (with `session locked to local__cavemem` note + `locked: false` — shared MCP session "mcp" held by probe 1; outcome/skill/score unaffected). Result: PASS, zero manual commands.

### Probe 3 — typo → expect ABSTAIN (id 12)
- `outcome: ABSTAIN`, `skill_id: null`, `confidence: 54`, `why: top local__skill-router score 54 < floor`. Result: PASS (proceeds bare), zero manual commands.

## Hook cross-check (shared fix this stage)
Fixed `hooks/route-hook.ps1` (`route --task "$Task"` form; backups `hooks/route-hook.ps1.bak` / `hooks/route-hook.sh.bak`): same 3 probes → cavemem 69 / grill-with-docs 91 / ABSTAIN 54, all PASS. Before-fix hook returned ABSTAIN (34) on probe 1 due to CLI positional-arg parsing appending `--cwd <path>` into the task string; `src/cli.ts` NOT touched (out of scope — flagged for a later stage). Full hook outputs in `claude-code-probes.md`.

## Verdict: PASS
opencode MCP: config present (no edit needed), handshake `initialize → tools/list → tools/call route` green, all 3 probes route correctly with zero manual commands over the exact stdio transport the client uses, plus a live in-session `route`-before-work call per AGENTS.md. Caveat: a fresh GUI-client session re-run by the owner would strengthen the proof but the transport-level evidence here is complete.
