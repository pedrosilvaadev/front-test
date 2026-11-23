# Installation — Claude Code autonomous workflow

1. Clone **your own fork/repository**, not the upstream challenge, then copy the contents of this package (including hidden `.claude/`) into its root. This package is a workflow scaffold, not the implemented NFT application.
2. Install Node.js 22+, npm, Git, Python 3 and Claude Code. Authenticate Claude Code (`claude`) and GitHub (`gh auth login` or SSH credentials). Ensure Claude Code supports project agents, skills, and hooks in your installed version.
3. `git remote -v` must show your GitHub repository as `origin`. Keep upstream challenge as `upstream` if needed. `git switch -c feat/jungle-foundation` (or another nonprotected feature branch).
4. Set `JUNGLE_OWN_GITHUB_OWNER` to the GitHub account or organization owning `origin` (e.g. `export JUNGLE_OWN_GITHUB_OWNER=my-handle`; PowerShell: `$env:JUNGLE_OWN_GITHUB_OWNER="my-handle"`). Never point origin to `junglegaming/frontend-challenge`.
5. Start `claude` at repository root and run `/orchestrate`. Review Claude Code tool permission prompts; autonomous execution depends on your local permissions. Do not use blanket bypass-permissions mode. You may need to approve Git push permissions in your environment.
6. After P0 scaffolds `package.json` and lockfile, run `npm ci` and `bash scripts/quality-gate.sh`. Full milestone gate: `bash scripts/quality-gate.sh --full` after `e2e` exists.
7. A successful reviewed slice is committed/pushed by `bash scripts/commit-slice.sh 'feat(catalog): add nft listing' -- src/... tests/... docs/PROGRESS.md`. The orchestrator should invoke it, not you manually. Never run it before independent review PASS.
8. Read `docs/WORKFLOW.md`, `docs/COMMIT_POLICY.md`, `docs/REQUIREMENTS.md`, and `IMPLEMENTATION_PLAN.md`. Provide Figma access/assets and any recruiter policy before visual implementation.

## Important limitations
- The Bash command guard blocks a few obvious dangerous commands, **not all possible shell bypasses**; Claude Code permission controls remain essential.
- The commit script verifies commands and remote but **cannot independently prove a reviewer approved**. The orchestrator must enforce review evidence in task files. The script does not verify remote repository write permissions until push.
- GitHub Actions is prepared for the future Node app and will fail until P0 creates `package.json` and `package-lock.json`; add them in the initial implementation slice before enabling branch protection.
- The gate assumes npm, a `test` script compatible with `--run` (e.g. Vitest), and an `e2e` script for full checks. If you select a different package manager/test runner, adapt scripts intentionally and document the decision.
- This package does not include real application source, screenshots, Figma assets, a deployed URL, or passing test results.
