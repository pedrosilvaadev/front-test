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
| P2-04 | R02,R03,R10 | frontend | PASS (--full, M1) | PASS | see git log | DONE — M1 closed |
| P3-01 | R06,R07,R08 | frontend | PASS (--full pre-loop; targeted e2e + quick gate post-loop) | PASS (after 1 fix loop) | see git log | DONE |
| P3-02 | R06,R07 | frontend | — | — | — | TODO (favorites, profile/avatar/password, wallets; closes M2) |
| P4-01 | R04 | frontend | — | — | — | TODO (cart limits, guest persistence + merge, coupon) |
| P4-02 | R05 | frontend | — | — | — | TODO (quote revalidation, wallet/network, payment, idempotent order) |
| P4-03 | R05 | frontend | — | — | — | TODO (pending/declined/confirmed immutable receipt; closes M3) |
| P5-01 | R09 | integration | — | — | — | TODO (socket.io-client mock transport, nft/order events, versioning, reconnect; closes M4) |
| P6-01 | R11,R10 | qa | — | — | — | TODO (12 E2E groups, visual baselines, a11y) |
| P6-02 | R12,R13 | qa | — | — | — | TODO (Lighthouse 3x medians, docs, deploy verification — deploy needs separate approval; closes M5) |

## Blockers
- Figma: resolved partially — owner exported 15 PNG frames to `docs/design/` (Desktop 1440w: 9 screens; Mobile 414w: 6 screens). No Dev Mode, so exact tokens (colors, fonts, spacing) are sampled from pixels; parity is visual, not token-exact. Brand in design: "Kurio", dark brown theme, orange accent, monospace type.
- Recruiter AI-use policy: none reported by owner yet.

## Backlog (from reviews)
- mock-api: reset must keep NFT versions monotonic (before P5); remove snapshot on setItem failure; reject/clear previousPrice <= price in dev patch.
- qa: throwing-storage test; multi-tab persistence note; strengthen font self-hosting test.
- frontend: cancel debounced search on history index change; overlay desktop search to avoid nav shift; consider zod-free route validator if Lighthouse needs.
- ui/layout: hide global mobile search bar + tab bar on NFT detail (Figma); header "Mercado" active on /nft.
- frontend: detail error-state document title; auto-select an in-stock edition when the selected one sells out (P5 realtime); e2e no-write-request assertion for unavailable actions.
- ui: safe-area insets for mobile top bar and side gutters; scan button contrast when enabled; switch planned-route <a> to <Link> as routes land.
- auth follow-ups: lazy account-menu error boundary; stricter stored-token check; move session-bridge to src/lib; scope mutation-cache clear to auth keys before P4.
- P3: ENS required on profile save; cross-tab logout `storage` listener; idempotency attempt clearing rules (ADR-004).
- Measure zod in main chunk when contracts reach app code.
