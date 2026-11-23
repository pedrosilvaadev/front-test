# Jungle Gaming — AI Engineering Implementation Plan

## Source of truth
- Challenge: https://github.com/junglegaming/frontend-challenge
- Design: https://www.figma.com/design/Ff0SksUi7UFtPWUO8kyNtw/Frontend-Challenge?node-id=0-1
- README requirements override agent preferences. Never mark a requirement done without evidence.

## Agent organization
- orchestrator: decomposes work, controls dependencies, dispatches bounded tasks, validates gates, authorizes commits.
- architect: contracts, boundaries, architecture decisions, data modeling, cache/session strategy.
- ui: Figma mapping, components, responsive design, accessibility, visual regression.
- frontend: routes, query/mutations, forms, user flows, optimistic UI.
- mock-api: Axios-facing REST contracts, MSW handlers, deterministic fixtures, persistence, fault injection.
- integration: Socket.IO protocol-compatible simulation, version handling, reconnection and REST reconciliation.
- qa: Playwright E2E, fixtures/reset, regression snapshots, Lighthouse evidence.
- reviewer: independent adversarial review against acceptance criteria, defects, security and regressions.

## Execution protocol per slice
1. Discover relevant README requirements, Figma frame, existing code and tests.
2. Plan smallest vertical slice, file ownership, dependencies, acceptance criteria, tests, risk and rollback.
3. Implement via one owner per file; parallelize only disjoint changes.
4. Verify locally with targeted tests and required typecheck/lint/build checks.
5. Independent reviewer inspects diff, acceptance criteria and test evidence.
6. Address findings; rerun impacted checks; max two fix-review loops before escalation.
7. Orchestrator stages ONLY relevant files and creates one Conventional Commit. Never auto-push unless user authorized.
8. Record decisions, completed requirements, evidence and next work.

## Work packages / dependency order
- P0 Foundation: Vite React TS, Tailwind, shadcn/ui, Router, Query, Axios, MSW, Playwright, lint/typecheck, CI, env, deployment shell.
- P1 Contracts + simulation: typed REST and event contracts; two users; deterministic fixture store; reset; latency/error scenarios; persistent session and cart.
- P2 Catalog: home, NFT detail, URL-driven search/filter/sort/pagination, empty/error/skeleton states, direct 404, responsive design.
- P3 Identity: registration/login/logout/session refresh/expiration, favorites, profile, avatar, password, wallets; user-isolated cache.
- P4 Commerce: cart limits, persisted guest cart and merge, coupon, quote, decimal ETH, wallet/network, checkout, idempotent orders, pending/declined/confirmed receipt.
- P5 Realtime: Socket.IO client through compatible mock transport; nft.updated/order.updated; version/dedup; disconnect/reconnect REST reconcile; stale quote re-confirmation.
- P6 Hardening: all 12 Playwright scenario groups, Chromium desktop/mobile, visual baselines, a11y, Lighthouse 3 runs per page/profile with medians, docs, production deploy verification.

## Milestone gates
- M0: app runs from clean checkout, CI passes, deploy preview available.
- M1: catalog/detail routes with URL state and MSW handlers, responsive Figma parity.
- M2: auth/account and isolated state, E2E auth cases.
- M3: full checkout with actual simulated order states, idempotency, persistent receipt.
- M4: real Socket.IO client integration and deterministic failure/reconnect E2E.
- M5: full evidence, published URL, docs and clean checkout verification.

## Acceptance criteria template
- Requirement reference (README section and frame)
- Behavior and unhappy paths
- State and API contract changes
- Accessibility and responsive checks (390/768/1440)
- Unit/integration/E2E coverage
- Verification commands and actual results
- Independent reviewer decision
- Conventional commit hash

## Hard rules
- All REST via Axios -> MSW, no inline business mocks.
- Socket.IO events must exercise socket.io-client; no direct cache setters as fake socket transport.
- ETH decimal strings; use decimal arithmetic; never JS floats for money.
- Idempotency keys persist across retry/reload for the same attempt; same key + different payload = conflict.
- Receipt is immutable snapshot; never derive from current catalog.
- No user data leaks across logout or user switch; remove subscriptions and private caches.
- No fake success UI for out-of-scope actions.
- No completion claims without executable evidence.
- Respect challenge AI policy if additional recruiter instructions exist.

## Commit conventions
Use Conventional Commits: feat, fix, test, refactor, chore, docs, perf, ci, style.
Examples:
- chore(setup): bootstrap vite and typescript tooling
- feat(catalog): synchronize filters with router search params
- feat(mock-api): add deterministic nft listing handlers
- test(checkout): cover idempotent order retry
- fix(realtime): ignore stale nft version events
- docs(architecture): document cache and socket reconciliation
One coherent change per commit. Never commit failing tests or unrelated generated artifacts. Run secret scanning before commit. Do not rewrite shared history.

## CI gates
Typecheck; lint; unit/integration; Playwright smoke on PR; full Chromium desktop/mobile suite before milestone; build; Lighthouse final audit. Save HTML reports, traces on failure, and visual baselines. CI and local scripts must use identical fixture reset/scenario selection.

## Definition of done
Acceptance criteria satisfied; no critical reviewer findings; tests and build passing; responsive/accessibility evidence; deterministic mocks; documentation updated; commit created; traceability to README preserved.

## First orchestrator command
Read README and Figma, audit repository, then propose P0 tasks with file ownership, acceptance criteria, test strategy, and commit sequence. Do not implement until the plan is approved. After approval, execute one bounded slice at a time with independent review and verification before each commit. Never push or deploy without explicit authorization.
