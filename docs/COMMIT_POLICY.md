# Conventional commits and push policy

Format: `type(scope): imperative summary` (types: feat, fix, test, docs, refactor, chore, perf, ci, style). One coherent, reviewable slice per commit. Prefer a sequence of small vertical commits with passing tests, rather than artificial micro-commits that break the build.

Only orchestrator stages explicit paths. `scripts/commit-slice.sh` requires a clean baseline (no unrelated unstaged changes), checks the gate and scans staged content for likely secrets. Pushes the current branch to `origin` after verifying that `origin` is NOT `junglegaming/frontend-challenge`; requires `JUNGLE_OWN_GITHUB_OWNER` to match owner in origin URL. No `--force`, no rewrite, no deploy. Configure your own fork/repo and `JUNGLE_OWN_GITHUB_OWNER` before autonomous runs. Trunk-based on `main` per ADR-001: the repository owner authorized pushing reviewed slices directly to `main` of `pedrosilvaadev/front-test` (`JUNGLE_ALLOW_MAIN_PUSH=1`). Feature branches remain optional.

Examples:
- chore(setup): configure tanstack router
- feat(mock-api): add persistent nft fixture store
- feat(catalog): sync filters with search params
- test(catalog): cover browser history restoration
- fix(checkout): recover timed out order by idempotency key
