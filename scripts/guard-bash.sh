#!/usr/bin/env bash
# Claude Code PreToolUse hook. Receives tool JSON on stdin.
set -euo pipefail
input="$(cat)"
if ! command -v python3 >/dev/null 2>&1; then echo 'python3 required for command guard' >&2; exit 2; fi
printf '%s' "$input" | python3 -c '
import json,re,sys
try: command=json.load(sys.stdin).get("tool_input",{}).get("command","")
except Exception: sys.exit(2)
blocked=[r"git\s+push\s+.*--force",r"git\s+reset\s+--hard",r"git\s+clean\s+-[a-zA-Z]*f",r"rm\s+-rf\s+[/~]",r"git\s+push\s+.*\s\+",r"git\s+commit\s+.*--amend"]
if any(re.search(x,command,re.I) for x in blocked):
 print("Blocked destructive/protected command. Ask user before proceeding.",file=sys.stderr);sys.exit(2)
'
