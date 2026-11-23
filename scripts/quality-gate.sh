#!/usr/bin/env bash
set -euo pipefail
full=0
[[ "${1:-}" == "--full" ]] && full=1
if [[ ! -f package.json ]]; then
  echo 'BLOCK: package.json absent; project not scaffolded' >&2; exit 1
fi
command -v node >/dev/null || { echo 'Node.js required' >&2; exit 1; }
command -v npm >/dev/null || { echo 'npm required' >&2; exit 1; }
[[ -f package-lock.json ]] || { echo 'BLOCK: package-lock.json absent; adjust gate for chosen package manager intentionally' >&2; exit 1; }
[[ -d node_modules ]] || { echo 'BLOCK: dependencies not installed; run npm ci' >&2; exit 1; }
for task in typecheck lint test build; do
  node -e 'const p=require("./package.json");process.exit(p.scripts?.[process.argv[1]]?0:1)' "$task" || { echo "BLOCK: missing npm script: $task" >&2; exit 1; }
  echo "GATE: npm run $task"
  if [[ "$task" == test ]]; then CI=1 npm run test -- --run; else npm run "$task"; fi
done
if [[ "$full" -eq 1 ]]; then
  node -e 'const p=require("./package.json");process.exit(p.scripts?.e2e?0:1)' || { echo 'BLOCK: missing npm script e2e' >&2; exit 1; }
  CI=1 npm run e2e
fi
echo 'PASS: configured quality gates'
