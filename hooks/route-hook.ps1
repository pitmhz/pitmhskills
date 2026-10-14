#Requires -Version 5.1
param([string]$Task = "")
if ([string]::IsNullOrWhiteSpace($Task)) { exit 0 }
$dir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$out = & bun "$dir/src/cli.ts" route --task "$Task" --cwd (Get-Location).Path 2>$null
Write-Output $out
