# Architecture decisions

Record date, context, options, choice, tradeoffs, affected files, tests and approval status. No decisions have been validated yet.

## ADR-001 — Trunk-based delivery on `main` (2026-11-23)
- **Context:** `origin` is `https://github.com/pedrosilvaadev/front-test.git`, owned by the user (admin). The kit originally required feature branches.
- **Decision:** Owner explicitly approved committing and pushing reviewed slices directly to `main`, and a one-time bootstrap commit of the workflow kit before any app code exists.
- **Guards kept:** owner check of origin (`JUNGLE_OWN_GITHUB_OWNER=pedrosilvaadev`), never `junglegaming` upstream, explicit-path staging, quality gate, secret scan, no force push / amend / hard reset. Main push requires `JUNGLE_ALLOW_MAIN_PUSH=1`.
- **Status:** Approved by owner.
