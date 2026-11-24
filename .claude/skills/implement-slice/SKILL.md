---
name: implement-slice
description: Implement and verify one bounded challenge task
---

# Implement one slice

Input: slice ID and acceptance criteria. Read task file and README requirement references. Confirm dependencies and file ownership. Delegate to the appropriate implementer (or implement directly if small), who also writes the tests. Implementer runs targeted tests; orchestrator runs the gate once (ADR-008: quick gate + slice e2e; `--full` at milestone close); independent reviewer must return PASS. Fix BLOCK findings up to two loops. On PASS, ask orchestrator to commit and push. Update docs/PROGRESS.md with exact evidence. Never claim a check passed without exit status.
