---
name: release-check
description: Audit full challenge readiness
---

# Release readiness

Use QA + independent reviewer. Verify all requirement rows, 12 E2E groups, visual snapshots, accessible keyboard flows, Socket.IO transport on deployed origin, 3 Lighthouse measurements per page/profile, reproducible mocks, documentation, direct route refresh, clean checkout build and deploy URL. Run `bash scripts/quality-gate.sh --full`; do not claim release-ready on missing evidence. Deployment requires separate approval.
