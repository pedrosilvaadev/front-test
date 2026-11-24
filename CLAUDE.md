# Jungle Gaming — Claude Code operating contract

Read `IMPLEMENTATION_PLAN.md`, `docs/REQUIREMENTS.md`, and `docs/PROGRESS.md` before changes. The challenge README and Figma are authoritative. Do not claim visual parity without viewing the design; request access or document a blocker.

## Execution
- **Deadline mode (ADR-009, active):** orchestrator may implement directly; per slice quick gate + slice e2e, no per-slice review; one independent review + `--full` gate at the end. Rules below apply except where ADR-009 relaxes them.
- Invoke `/orchestrate` to manage the project. Orchestrator delegates to architect, mock-api, frontend, ui, integration, qa, and reviewer as needed (ADR-008: implementer writes its own tests; QA for milestone suites/hardening; small slices may be implemented by the orchestrator); the reviewer must always be a separate agent independent of the implementer.
- For every slice: discovery → scoped plan → implement (with own tests) → targeted tests → one integrated gate by the orchestrator → independent review → corrections (at most two loops) → revalidation → semantic commit → automatic push → progress report. Cadence per ADR-008: quick gate + slice e2e per slice; `--full` at milestone close.
- Agents must not invent evidence. Record commands, exit codes, and test artifacts. Never bypass a failed gate.
- One owner per file in concurrent tasks. Use isolated worktrees for parallel modifications; orchestrator integrates and verifies sequentially.
- Do not let reviewer edit production files. Implementers write their slice tests; QA owns milestone suites, shared test infrastructure and evidence, not feature implementation.
- Only the orchestrator may stage, commit, or push. Never run `git add .`; stage explicit files only. Never amend published commits or force push.
- Push is explicitly authorized by the user **after successful quality gates** to the user's own origin `pedrosilvaadev/front-test`, directly on `main` (owner decision, ADR-001; trunk-based, no feature branches required). Never push to junglegaming/frontend-challenge or an unknown upstream; if ownership cannot be verified, stop and ask.
- No deploy or destructive git operations without separate authorization. Do not disable security checks or alter gate scripts to make a failing slice pass.
- Respect any additional recruiter AI-use policy. No secrets, personal credentials, or real payment data.

## Technical invariants
REST via Axios→MSW; no UI-level fake API data. Socket.IO through `socket.io-client` and compatible mocked transport. ETH values as decimal strings with decimal arithmetic. Idempotent checkout, immutable receipts, session-isolated caches, stale-event protection and reconnection reconciliation. URL-driven catalog state. Playwright Chromium mobile/desktop; Lighthouse final evidence.

## Commands
- `/orchestrate`: plan and execute the next bounded slice
- `/implement-slice`: run one specified slice
- `/review-slice`: independent review
- `/release-check`: full release readiness audit

Follow `docs/WORKFLOW.md` and `docs/COMMIT_POLICY.md`.
