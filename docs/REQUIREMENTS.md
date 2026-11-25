# Requirements traceability (populate evidence as implemented)

| ID | Source | Scope | Evidence | Status |
|---|---|---|---|---|
| R01 | README §2 | All required technologies used effectively | P0-01…P6-02 (stack in package.json; README §Stack) | DONE |
| R02 | §3 | Nine pages, desktop/mobile | P2-02/P2-03 (início, detalhe), P3-01/P3-02 (login, cadastro, perfil, carteiras, favoritos), P4-01/P4-02 (carrinho, checkout, pedido); e2e desktop+mobile | DONE |
| R03 | §3 | URL search/filter/sort/pagination; race/empty/error | P2-02/P2-04 (e2e/catalog.spec.ts) | DONE |
| R04 | §3 | Cart, coupons, decimal ETH, persisted guest merge | P4-01 (e2e/cart.spec.ts) | DONE |
| R05 | §3 | Checkout, quote revalidation, idempotency, receipts | P4-02 (e2e/checkout.spec.ts, e2e/purchase.spec.ts) | DONE |
| R06 | §3 | Auth, session expiration, profile, wallets, isolation | P3-01/P3-02 (e2e/auth.spec.ts, e2e/account.spec.ts) | DONE |
| R07 | §4–5 | Typed REST, cache, optimistic rollback | P1-01, P2-*, P3-02 (contracts + api tests, optimistic favorites rollback) | DONE |
| R08 | §6 | Stateful MSW scenarios, two users, reset, failures | P0-02/P1-02 + dev controls (src/mocks, ARCHITECTURE §6) | DONE |
| R09 | §6–7 | socket.io-client mock transport, versioning, reconnect | P5-01 (e2e/realtime.spec.ts, realtime-cache.test.ts) | DONE |
| R10 | §8 | Figma parity, responsive, skeletons, a11y | P2-01…P6-01 (visual baselines, axe scan e2e/a11y.spec.ts, skeleton specs); deviations in ARCHITECTURE §9 | DONE |
| R11 | §9 | 12 E2E groups, visual baselines, reports | P6-01 coverage map (docs/tasks/P6-01.md), e2e/__screenshots__, playwright-report | DONE |
| R12 | §10 | Lighthouse 3 runs x pages x profiles; medians | P6-02 (docs/lighthouse: medians, reports; mobile perf 75/80 below target, justified) | DONE (mobile perf below 90, analysed) |
| R13 | §12 | Public deploy, refresh, docs, clean checkout | https://front-test-gray.vercel.app (Vercel prod; routes/refresh/MSW/socket/login verified 2026-11-25); README + ARCHITECTURE | DONE |
