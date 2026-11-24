# Delivery workflow

## Deadline mode (ADR-009, active — supersedes ADR-008 until delivery)
Orchestrator may implement directly; per slice: quick gate + slice e2e, commit and push; no per-slice review. One independent review of the cumulative diff since 8511e4f, fixes, then `--full` before delivery.

## Lean cadence (ADR-008, owner-approved 2026-11-24)
- Implementer runs targeted unit/e2e for its slice plus typecheck/lint, and writes its own tests (no separate QA agent per slice).
- Orchestrator runs ONE gate on the integrated tree before commit: quick gate (`bash scripts/quality-gate.sh`) + the slice's Playwright specs on both Chromium projects. `--full` only at milestone close (M1–M5) or when shared e2e infrastructure changes.
- Reviewer (separate agent, always) reads diff + acceptance criteria + recorded evidence; re-runs only targeted checks to settle a concrete doubt. Figma screenshot comparison only when the slice delivers a new screen.
- Small slices may be implemented directly by the orchestrator; review stays independent.
- QA agent: milestone suites, flaky-test hardening, Lighthouse.
- Unchanged: review PASS before commit, no commit on failed gate, no gate-script edits to pass, max two fix loops, explicit staging.

## Per slice
1. **Discover**: cite README section, Figma frame, and current files.
2. **Plan**: fill task template, specify ownership, dependencies, tests, risks.
3. **Implement**: one writer per file; no implicit contract changes.
4. **Validate**: implementer runs targeted tests; orchestrator runs the gate once per ADR-008. Record exit codes.
5. **Independent review**: reviewer agent not involved in implementation. PASS or BLOCK with reproducible findings.
6. **Repair**: implementer fixes; rerun affected tests, then the orchestrator reruns the gate once. Maximum two review cycles; escalate persistent blockers.
7. **Commit + push**: orchestrator runs `scripts/commit-slice.sh` with explicit paths and a Conventional Commit message. Script reruns gate, secret checks and validates safe origin/branch. No force pushes.
8. **Report**: update progress, requirements, ADRs and next slice. Commit progress with same slice where appropriate.

## Parallelism
Use isolated worktrees or sequential edits. Never have two agents write the same file concurrently. QA may prepare tests separately. Reviewer always reads integrated final diff.

## Gates
For bootstrap, scripts validate whatever tooling is present; once package.json exists, missing required scripts are failures. Gate scripts: typecheck, lint, test, build; full mode also e2e. Milestone requires Chromium desktop/mobile E2E. Final release requires Lighthouse and screenshots. CI is authoritative for branch integration.

## Escalation
Stop for unknown remote, unowned remote, protected branch, unavailable Figma, unverified Socket.IO mock compatibility, missing tests, failed gate, security issues, or ambiguous requirement. Do not claim unverified success.
