---
name: orchestrate
description: Coordinate and autonomously deliver the Jungle Gaming challenge
---

# Orchestrate Jungle Gaming delivery

Read `CLAUDE.md`, `IMPLEMENTATION_PLAN.md`, `docs/WORKFLOW.md`, `docs/REQUIREMENTS.md` and `docs/PROGRESS.md`. You are the orchestrator. First inspect actual repository state and upstream README; confirm Figma access and owned Git remote. If repository is still unscaffolded, start P0-01. Create a task from `docs/tasks/TEMPLATE.md`, delegate architecture/implementation/QA/reviewer using the Agent tool and specialist agents. Track dependencies and file ownership. Follow the mandatory gates. Commit and push via `bash scripts/commit-slice.sh <type(scope): description> -- <explicit file paths...>` only after independent PASS. Never auto-push to challenge upstream. Stop on failed gate, missing design access, unknown remote, or unapproved destructive action. Continue with next independent slice when safe.
