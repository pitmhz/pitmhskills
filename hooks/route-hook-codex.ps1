# Codex UserPromptSubmit and SubagentStart hook for pitmhskills.
# Codex sends one JSON event on stdin and expects JSON context on stdout.
$ErrorActionPreference = "Stop"

try {
  $raw = [Console]::In.ReadToEnd()
  $event = $raw | ConvertFrom-Json
  $eventName = [string]$event.hook_event_name
  $instruction = @"
Follow every applicable AGENTS.md before acting. Use the pitmhskills router result below before beginning work. Load only the skill it returns; if no skill is returned, proceed without one. If this is a subagent task and no route result appears below, call the pitmhskills MCP route tool on your assigned task and cwd first.
"@

  if ($eventName -eq "UserPromptSubmit" -and -not [string]::IsNullOrWhiteSpace([string]$event.prompt)) {
    $repo = "C:\Users\Mattchine\pitmhskills"
    $cli = Join-Path $repo "src\cli.ts"
    $bun = Get-Command bun -ErrorAction Stop
    $cwd = if ([string]::IsNullOrWhiteSpace([string]$event.cwd)) { (Get-Location).Path } else { [string]$event.cwd }
    $sid = [string]$event.session_id
    $tid = [string]$event.turn_id
    $session = "codex-hook-$sid-$tid"
    $route = & $bun.Source $cli route --task ([string]$event.prompt) --cwd $cwd --session $session 2>&1 | Out-String
    if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($route)) {
      $instruction += "`n`nROUTER RESULT:`n$route"
    } else {
      $instruction += "`n`nRouter command failed. Call the pitmhskills MCP route tool before acting."
    }
  }

  $output = @{
    hookSpecificOutput = @{
      hookEventName = $eventName
      additionalContext = $instruction.Trim()
    }
  }
  $output | ConvertTo-Json -Depth 6 -Compress
} catch {
  # Keep the hook fail-open, while telling the agent to route through MCP.
  $fallback = @{
    hookSpecificOutput = @{
      hookEventName = "UserPromptSubmit"
      additionalContext = "Follow every applicable AGENTS.md. Call the pitmhskills MCP route tool on this task and cwd before acting; load only the returned skill."
    }
  }
  $fallback | ConvertTo-Json -Depth 6 -Compress
}
