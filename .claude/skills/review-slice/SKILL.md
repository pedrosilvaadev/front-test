---
name: review-slice
description: Run independent adversarial review of a task
---

# Independent review

Use reviewer agent only; reviewer must not be the implementer. Read task, requirements, `git diff` and the recorded gate evidence; do not re-run the full gate (ADR-008), only targeted checks to settle a concrete doubt. Compare screenshots with Figma only when the slice delivers a new screen. Return a structured decision: PASS or BLOCK; list severity, file:line, reproduction, violated requirement, and remediation. No commits, pushes or production edits.
