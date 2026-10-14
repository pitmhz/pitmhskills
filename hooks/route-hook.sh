#!/usr/bin/env bash
# Claude Code UserPromptSubmit hook: deterministic route before model sees prompt.
# Install: Settings -> Hooks -> UserPromptSubmit -> this script
set -euo pipefail
TASK="${1:-}"
if [ -z "$TASK" ]; then exit 0; fi
DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT=$(bun "$DIR/src/cli.ts" route "$TASK" --cwd "$PWD" 2>/dev/null || true)
echo "$OUT"
