# Delivery workflow

## Per slice
1. **Discover**: cite README section, Figma frame, and current files.
2. **Plan**: fill task template, specify ownership, dependencies, tests, risks.
3. **Implement**: one writer per file; no implicit contract changes.
4. **Validate**: run targeted tests, then `scripts/quality-gate.sh` (all configured checks). Record exit codes.
5. **Independent review**: reviewer agent not involved in implementation. PASS or BLOCK with reproducible findings.
6. **Repair**: implementer fixes; rerun affected tests and all gates. Maximum two review cycles; escalate persistent blockers.
7. **Commit + push**: orchestrator runs `scripts/commit-slice.sh` with explicit paths and a Conventional Commit message. Script reruns gate, secret checks and validates safe origin/branch. No force pushes.
8. **Report**: update progress, requirements, ADRs and next slice. Commit progress with same slice where appropriate.

## Parallelism
Use isolated worktrees or sequential edits. Never have two agents write the same file concurrently. QA may prepare tests separately. Reviewer always reads integrated final diff.

## Gates
For bootstrap, scripts validate whatever tooling is present; once package.json exists, missing required scripts are failures. Gate scripts: typecheck, lint, test, build; full mode also e2e. Milestone requires Chromium desktop/mobile E2E. Final release requires Lighthouse and screenshots. CI is authoritative for branch integration.

## Escalation
Stop for unknown remote, unowned remote, protected branch, unavailable Figma, unverified Socket.IO mock compatibility, missing tests, failed gate, security issues, or ambiguous requirement. Do not claim unverified success.
