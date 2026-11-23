---
name: implement-slice
description: Implement and verify one bounded challenge task
---

# Implement one slice

Input: slice ID and acceptance criteria. Read task file and README requirement references. Confirm dependencies and file ownership. Delegate to the appropriate implementer. Request QA tests. Run targeted tests then `bash scripts/quality-gate.sh`; independent reviewer must return PASS. Fix BLOCK findings up to two loops. On PASS, ask orchestrator to commit and push. Update docs/PROGRESS.md with exact evidence. Never claim a check passed without exit status.
