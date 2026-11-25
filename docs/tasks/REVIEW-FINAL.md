# Final independent review (ADR-009)

- **Reviewer:** separate `reviewer` agent (read-only, did not implement), at HEAD 3bd5c9c.
- **Scope:** whole delivery against the challenge README §1–§12. Priority went to slices never reviewed before: P3-02, P4-01, P4-02, P5-01, P6-01 and P6-02.
- **Decision:** BLOCK on two MAJOR bugs. No eliminatory blockers: real stack, confirmation only from the server, user isolation, no UI-simulated events, executable E2E.
- **Reviewer evidence:**
  - `npm run typecheck`: exit 0.
  - `npm run lint`: exit 0.
  - vitest: exit 0, 411 passed.
  - Playwright: not run, because the orchestrator's `--full` gate was using the port.

## Findings and resolution
| ID | Severity | Finding | Resolution |
|---|---|---|---|
| M1 | MAJOR | A lost order response followed by background confirmation emptied the cart, so checkout showed "empty" and the user never reached the receipt (also after reload) | `recoverAttempt` + `useRecoverAttempt`: when the cart is empty and a stored attempt has no `orderId`, the attempt is replayed with the same key and the app navigates to `/pedidos/<id>`. Unit tests (place-order.test.ts) and an e2e test that waits past `resolveDelayMs` with no second click (checkout.spec.ts) |
| M2 | MAJOR | The mock accepted a quote already used by an order, or one for an older cart version, so a second order was possible (two tabs; or a cleared attempt with a new key) | Server: a quote used by a pending/confirmed order → 409 `QUOTE_EXPIRED`; `quote.cartVersion` ≠ current cart → 409 `QUOTE_CHANGED` with a fresh quote. Client: a confirmed previous order of the same quote is shown instead of paying again. Unit tests (orders.test.ts, place-order.test.ts); API_CONTRACTS revalidation wording corrected |
| M3 | MAJOR | Public deploy missing (README §12) | Owner approved; deployed to https://front-test-gray.vercel.app and verified (direct routes/refresh, MSW, socket event, login, catalog filters) |
| m1 | MINOR | Checkout wallets query did not pin the user's token | `walletsQueryOptions(userId, manager)` uses `tokenFor`, same as the wallets page |
| m2 | MINOR | `placeOrder` may split an attempt across users if the session switches mid-submit | Open (low risk: submit is a short window; server ownership checks hold) |
| m3 | MINOR | Checkout can ask to accept changes already seen on the cart page | Open (conservative: an extra acknowledgement, no wrong purchase) |
| m4 | MINOR | Favorites list prices are not patched by `nft.updated` | Open (refreshed on refetch) |
| m5 | MINOR | The outage e2e could also pass through order polling; no e2e emits a foreign-user `order.updated` | Open (covered by unit tests in realtime-cache.test.ts) |
| m6 | MINOR | Lighthouse mobile performance 75/80 | Documented with causes (docs/lighthouse/README.md) |

## Verification after fixes (orchestrator)
| Command | Exit code | Result |
|---|---|---|
| `bash scripts/quality-gate.sh --full` (at 3bd5c9c, before fixes) | 0 | 411 unit; 202 e2e passed, 12 skipped |
| vitest orders + checkout | 0 | 21 passed |
| playwright checkout + purchase + realtime | 0 | 38 passed (includes the new M1 test) |

## Re-review of dfa5729 (same independent reviewer)
- **Decision: PASS.** M1, M2 and m1 are resolved with no regression. The reviewer ran `git show` and vitest for checkout + orders (21 passed).
- **New MINOR finding:** when the cart changes in another tab, the `QUOTE_CHANGED` details can carry `changes: []`. The client schema requires at least one change, so clicking "Confirmar compra" showed nothing.
  - **Fix:** a generic review message ("Seu carrinho mudou. Revise os valores e confirme novamente.") plus a quote refetch (checkout-form.tsx).
