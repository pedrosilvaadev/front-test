# Progress

| Slice | Requirement | Owner | Gates | Independent review | Commit | Status |
|---|---|---|---|---|---|---|
| BOOT | — | orchestrator | N/A (no app yet) | N/A (owner-approved kit) | see git log | DONE |
| P0-01 | R01 | frontend | PASS | PASS (reviewer) | see git log | DONE |
| P0-02 | R07,R08 | mock-api | PASS | PASS (after 1 fix loop) | see git log | DONE |
| P0-03 | R11 | qa | PASS (--full) | PASS | see git log | DONE |
| P1-01 | R07,R08 | architect | PASS | PASS (after 1 fix loop) | see git log | DONE |
| P1-02 | R08 | mock-api | PASS (+e2e) | PASS | see git log | DONE |
| P2-01 | R10,R02 | ui | PASS (--full) | PASS | see git log | DONE |
| P2-02 | R03,R07,R10 | frontend | PASS (--full) | PASS (after 1 fix loop) | see git log | DONE |
| P2-03 | R02,R10,R07 | frontend (+qa loop 1) | PASS (--full) | PASS (after 1 fix loop) | see git log | DONE |

## Blockers
- Figma: resolved partially — owner exported 15 PNG frames to `docs/design/` (Desktop 1440w: 9 screens; Mobile 414w: 6 screens). No Dev Mode, so exact tokens (colors, fonts, spacing) are sampled from pixels; parity is visual, not token-exact. Brand in design: "Kurio", dark brown theme, orange accent, monospace type.
- Recruiter AI-use policy: none reported by owner yet.

## Backlog (from reviews)
- mock-api: reset must keep NFT versions monotonic (before P5); remove snapshot on setItem failure; reject/clear previousPrice <= price in dev patch.
- qa: throwing-storage test; multi-tab persistence note; strengthen font self-hosting test.
- frontend: cancel debounced search on history index change; overlay desktop search to avoid nav shift; consider zod-free route validator if Lighthouse needs.
- frontend: dedupe isPlainClick (home); hero/featured NFT links → router Link in P2-04.
- ui: safe-area insets for mobile top bar and side gutters; scan button contrast when enabled; switch planned-route <a> to <Link> as routes land.
- P3: ENS required on profile save; cross-tab logout `storage` listener; idempotency attempt clearing rules (ADR-004).
- Measure zod in main chunk when contracts reach app code.
