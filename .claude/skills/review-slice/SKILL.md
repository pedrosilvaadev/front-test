---
name: review-slice
description: Run independent adversarial review of a task
---

# Independent review

Use reviewer agent only; reviewer must not be the implementer. Read task, requirements, `git diff` and actual test results. Return a structured decision: PASS or BLOCK; list severity, file:line, reproduction, violated requirement, and remediation. No commits, pushes or production edits.
