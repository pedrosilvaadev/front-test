#!/usr/bin/env bash
set -euo pipefail
if [[ "$#" -lt 3 || "${2:-}" != '--' ]]; then echo 'Usage: bash scripts/commit-slice.sh "feat(scope): description" -- file1 [file2 ...]' >&2; exit 2; fi
message="$1"; shift 2
[[ "$message" =~ ^(feat|fix|test|docs|refactor|chore|perf|ci|style)\([a-z0-9-]+\):\ .+ ]] || { echo 'Invalid Conventional Commit message' >&2; exit 2; }
[[ -n "${JUNGLE_OWN_GITHUB_OWNER:-}" ]] || { echo 'Set JUNGLE_OWN_GITHUB_OWNER to your GitHub username/org' >&2; exit 2; }
branch="$(git branch --show-current)"
[[ -n "$branch" ]] || { echo 'BLOCK: detached HEAD' >&2; exit 2; }
if [[ "$branch" == main || "$branch" == master ]] && [[ "${JUNGLE_ALLOW_MAIN_PUSH:-}" != 1 ]]; then
  echo 'BLOCK: main/master push requires owner opt-in JUNGLE_ALLOW_MAIN_PUSH=1 (see docs/DECISIONS.md ADR-001)' >&2; exit 2
fi
remote="$(git remote get-url origin)"
python3 - "$remote" "$JUNGLE_OWN_GITHUB_OWNER" <<'PYREMOTE'
import re,sys
url,owner=sys.argv[1:]
m=re.search(r"(?:github\.com[:/])([^/]+)/([^/]+?)(?:\.git)?$",url)
if not m or m.group(1).lower()!=owner.lower() or m.group(1).lower()=='junglegaming':
 sys.exit('BLOCK: origin must be a GitHub repository owned by JUNGLE_OWN_GITHUB_OWNER, not challenge upstream')
PYREMOTE
[[ -z "$(git diff --cached --name-only)" ]] || { echo 'BLOCK: preexisting staged changes' >&2; exit 2; }
python3 - "$@" <<'PYPATHS'
import subprocess,sys
allowed=sys.argv[1:]
changed=subprocess.check_output(['git','status','--porcelain','--untracked-files=all'],text=True).splitlines()
for line in changed:
 path=line[3:]
 if not any(path==a or path.startswith(a.rstrip('/')+'/') for a in allowed):
  sys.exit('BLOCK: unrelated modified/untracked path: '+path)
PYPATHS
# Require paths explicitly. The orchestrator must first ensure review PASS; this script cannot attest to reviewer identity.
for path in "$@"; do [[ -e "$path" ]] || { echo "Missing path: $path" >&2; exit 2; }; done
bash scripts/quality-gate.sh
for path in "$@"; do git add -- "$path"; done
[[ -n "$(git diff --cached --name-only)" ]] || { echo 'No staged changes' >&2; exit 2; }
if git diff --cached --name-only | grep -Ei '(^|/)(\.env($|\.)|id_rsa|.*\.pem$|.*\.key$)' ; then echo 'BLOCK: potential secret filename staged' >&2; exit 2; fi
if git diff --cached --unified=0 | grep '^+' | grep -Ei '(BEGIN (RSA |OPENSSH )?PRIVATE KEY|ghp_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,})' ; then echo 'BLOCK: possible secret in diff' >&2; exit 2; fi
git commit -m "$message"
git push -u origin "$branch"
echo "PUSHED $(git rev-parse --short HEAD) to origin/$branch"
