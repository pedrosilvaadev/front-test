# Architecture decisions

Record date, context, options, choice, tradeoffs, affected files, tests and approval status. No decisions have been validated yet.

## ADR-001 — Trunk-based delivery on `main` (2026-11-23)
- **Context:** `origin` is `https://github.com/pedrosilvaadev/front-test.git`, owned by the user (admin). The kit originally required feature branches.
- **Decision:** Owner explicitly approved committing and pushing reviewed slices directly to `main`, and a one-time bootstrap commit of the workflow kit before any app code exists.
- **Guards kept:** owner check of origin (`JUNGLE_OWN_GITHUB_OWNER=pedrosilvaadev`), never `junglegaming` upstream, explicit-path staging, quality gate, secret scan, no force push / amend / hard reset. Main push requires `JUNGLE_ALLOW_MAIN_PUSH=1`.
- **Status:** Approved by owner.

## ADR-002 — Runtime contract validation with zod at both boundaries (2026-11-23)
- **Context:** README §4 requires typed contracts between transport, state and UI; §6 requires mocks to reuse the same contracts. TypeScript types are erased at runtime, so mock/client drift would only surface as UI bugs.
- **Options:** (a) hand-written TS interfaces only; (b) OpenAPI + codegen; (c) zod schemas with `z.infer` types; (d) valibot / `zod/mini` for size.
- **Decision:** (c) zod v4 (`zod@^4.6.7`). Schemas live in `src/contracts/**` grouped by resource (`session`, `nfts`, `favorites`, `cart`, `quote`, `orders`, `profile`, `wallets`, `realtime`, `common/{primitives,pagination,errors}`); types are `z.infer`/`z.input`, never duplicated by hand.
  - MSW handlers parse request bodies/queries with the request schema → 422 `VALIDATION_ERROR` / 400 `INVALID_QUERY` with `toFieldErrorsDetails(error)`; fixtures are typed with the response types.
  - The Axios API modules parse every 2xx body with the response schema (`schema.parse(data)`), so a contract break fails loudly in dev and tests. Error bodies keep using `toApiError`; `errorEnvelopeSchema` is structurally identical to `ErrorEnvelope` (`satisfies` check).
  - Forms reuse the same field schemas (`registerFormSchema`, `changePasswordFormSchema`, `walletInputSchema`), so client and mock validation agree.
  - Response schemas only apply idempotent normalization (trim/lower-case, csv → sorted list, canonical ETH bounds), never shape-changing transforms.
  - Objects use zod's default **strip** mode: unknown keys in responses are dropped (forward compatible with additive server changes) rather than rejected. Because stripping would hide typos in fixtures, contract/fixture tests use an exact round-trip assertion (`expectExactParse`: `schema.parse(fixture)` must `toStrictEqual(fixture)`); P1-02 fixtures must be checked the same way.
  - Cross-field invariants are encoded in the schema (discriminated unions for order status ↔ transaction/decline, refinements for edition supply/availability, wallet address ↔ network, wallet connection ↔ wallet). Object-level refinements must not assume field checks passed (zod v4 can run them on invalid data).
- **Tradeoffs:** bundle weight (mitigated by route code-splitting; can move to `zod/mini` if Lighthouse requires it, at the cost of a mechanical rewrite). Response parsing costs CPU on lists (catalog pages are ≤48 items).
- **Files:** `src/contracts/**`, `package.json` (`zod`). **Tests:** `src/contracts/contracts.test.ts`.
- **Status:** Proposed (P1-01), pending independent review.

## ADR-003 — ETH as decimal strings with big.js arithmetic (2026-11-23)
- **Context:** README §3: ETH values travel as decimal strings and keep precision in calculations and presentation; quantities are integers.
- **Options:** JS numbers (rejected: `0.1 + 0.2`); `bigint` wei (precise, but scaling at every boundary and custom formatting); `decimal.js` (larger, many unneeded features: trig, exponentials, configurable precision); `big.js` (small, add/sub/mul/div/cmp/round only).
- **Decision:** `big.js@^7` behind `src/lib/money.ts`, the only module allowed to do ETH math. Wire format: regex `^(0|[1-9]\d*)(\.\d{1,18})?$` (non-negative, ≤18 decimals = wei, no sign/exponent/grouping). Results are canonical strings (no trailing zeros, never exponent notation). An isolated `Big()` constructor runs in **strict mode** (a JS number passed to it throws), DP 18, round half-up, so global `Big` settings cannot leak in. Quantities must be safe non-negative integers. Negative results throw `MoneyError` (`subEthClamped` for discount ≥ subtotal). Percent discounts round half-up at 18 dp. Display: `formatEth` rounds half-up to 4 dp, pads to 2 dp, prints `< 0.0001 ETH` for tiny non-zero amounts, "." decimal separator as in Figma.
- **Tradeoffs:** amounts are plain `string` aliases, not branded types (keeps fixtures/JSON ergonomic); validation happens at the zod boundary and inside every money function.
- **Files:** `src/lib/money.ts`, `src/contracts/common/primitives.ts`, `package.json` (`big.js`, `@types/big.js`). **Tests:** `src/lib/money.test.ts` (0.1+0.2, wei precision, rounding, negative guard, formatting).
- **Status:** Proposed (P1-01), pending independent review.

## ADR-004 — Query keys, cache scoping and session isolation (2026-11-23)
- **Context:** README §3/§4/§7: data isolated per user and per query params; logout/user switch must clear private caches and subscriptions; obsolete responses must be discarded.
- **Decision:**
  - Key prefixes by scope: `['catalog', ...]` public; `['cart', ownerKey, ...]` owner (`user:<id>` | `guest:<uuid>`); `['user', userId, ...]` private; `['session']`. Exact shapes in `docs/API_CONTRACTS.md` (Cache and query keys). The last segment is the **normalized** params object (`catalogQuerySchema.parse`) so equivalent URLs share one entry.
  - Public payloads never embed user-specific fields; favorite/cart state is joined in the UI from private queries.
  - Logout / user switch / `SESSION_EXPIRED`: `cancelQueries` then `removeQueries` for `['user']`, `['cart']`, `['session']`; disconnect the socket and drop its listeners. Mutation callbacks check that the session user is unchanged before writing to the cache.
  - Persisted checkout attempts (`localStorage` `kurio.checkoutAttempt.<userId>` = `{ userId, quoteId, idempotencyKey, payload, orderId? }`, written **before** `POST /api/orders` is sent) are **not** private cache: they are **kept** on `SESSION_EXPIRED` and on re-login as the same user, and deleted only when the order is terminal, on **explicit logout**, or when a **different** user signs in. Before generating any new `Idempotency-Key` the client resolves the stored attempt (replay with the same key + payload, `GET /api/orders/:orderId`, or `GET /api/orders?status=pending`). This prevents a timeout → session expiry → re-login sequence from creating a second order. The checkout draft (`sessionStorage`, no passwords) follows the same rule. Matrix in `docs/API_CONTRACTS.md` (Cache and query keys).
  - Query functions pass TanStack's `signal` to Axios (obsolete requests cancelled); the catalog also compares the echoed `query` (out-of-order guard).
  - Defaults: catalog `staleTime` 30 s; private data 0–30 s; queries `retry` ≤ 2 only when `ApiError.retryable` (transient/network/timeout); mutations never auto-retry (order creation retries manually with the same `Idempotency-Key`). Mutations replace (full-resource responses) or invalidate affected keys; realtime events patch only when `version` is newer.
- **Tradeoffs:** sharing catalog cache across users is safe only while public payloads stay user-agnostic; later slices must preserve this (reviewer checklist item).
- **Files:** documentation now; implemented by P2–P5 query modules. **Tests:** later slices (key factory unit tests, E2E user switch).
- **Status:** Proposed (P1-01), pending independent review.

## ADR-005 — Mock auth: bearer token, persisted, revalidated on reload (2026-11-23)
- **Context:** README §3: session recoverable after refresh; expiry during navigation and checkout with context preserved; no plaintext passwords; fictitious credentials only.
- **Options:** cookie session (MSW in a Service Worker cannot faithfully emulate `HttpOnly` cookies); bearer token.
- **Decision:** login/register return `{ session: { token, expiresAt, user }, cartMerge }`. The client keeps the token in memory and `localStorage` (`kurio.session`), sends `Authorization: Bearer`, and on boot calls `GET /api/auth/session` before resolving private routes (pending state, no flash of private content). 401 `SESSION_EXPIRED` / `UNAUTHORIZED` on an authenticated call → clear session + private caches (ADR-004), keep the current URL, the checkout draft (form values in `sessionStorage`, never passwords) **and the persisted checkout attempt (idempotency key + order id)**, redirect to `/login?redirect=…`. After re-login as the same user the checkout resumes by resolving that attempt before any new key is generated; a different user's login discards the previous user's draft and attempt. `INVALID_CREDENTIALS` is handled by the login form only. The mock stores salted password hashes (Web Crypto SHA-256) and opaque random tokens with a TTL; a dev control forces expiry for tests. The Socket.IO handshake uses the same token.
- **Tradeoffs:** `localStorage` tokens are readable by XSS; acceptable for a mock-only demo with fictitious credentials and documented as a production deviation (would be `HttpOnly` cookie + refresh). No refresh-token flow: expiry requires re-login.
- **Files:** `src/contracts/session.ts`; implementation P1-02 (mock) and P3 (client). **Tests:** P3 unit + E2E group 3.
- **Status:** Proposed (P1-01), pending independent review.

## ADR-006 — Server-side guest cart and atomic merge on login (2026-11-23)
- **Context:** README §3: cart survives refresh and the visitor's items are preserved on authentication, respecting availability per NFT/edition.
- **Options:** (a) client-only guest cart in `localStorage`, replayed as POSTs after login (non-atomic, partial failures, business rules duplicated on the client); (b) server cart for guests keyed by a client UUID plus a separate merge endpoint; (c) as (b) but merged atomically inside login/register.
- **Decision:** (c). The client creates `guestCartId = crypto.randomUUID()` once (`localStorage` `kurio.guestCartId`) and sends `X-Guest-Cart-Id` on cart/quote calls while anonymous. Login/register accept `guestCartId`; the mock merges in the same operation: quantities for the same `(nftId, editionId)` are summed and capped at `min(available, maxPerOrder)`; sold-out lines are dropped; each reduction is reported in `cartMerge.adjustments` (surfaced to the user). The guest cart is deleted and the client forgets the id (a new one is created after logout). The user cart's coupon wins; the guest coupon is kept only if the user cart has none. Authenticated carts persist server side (mock DB persisted locally by P1-02).
- **Tradeoffs:** one extra header; guest carts in the mock DB must be cleared by reset. A failed login leaves the guest cart untouched (no data loss).
- **Files:** `src/contracts/cart.ts`, `src/contracts/session.ts`; implementation P1-02 / P4. **Tests:** E2E group 5.
- **Status:** Proposed (P1-01), pending independent review.

## ADR-007 — Flat string search params for the router (2026-11-23)
- **Context:** TanStack Router's default search serializer JSON-encodes values (`minPrice=%221.5%22`, numeric `page`), breaking the contract's flat canonical catalog URLs (`serializeCatalogQuery`).
- **Decision:** `src/router.tsx` installs a global `parseSearch`/`stringifySearch` that keeps every value as a plain string (commas unescaped; prototype-safe parsing). Every route's `validateSearch` must accept string inputs and normalize them (the catalog uses `catalogQuerySchema`).
- **Consequences:** future routes cannot rely on typed JSON search values; repeated keys are only joined for list keys.
- **Status:** Accepted (orchestrator, after P2-02 review N1).

## ADR-008 — Lean delivery cadence (2026-11-24)
- **Context:** Each slice ran the full gate (≈4 min) 3–4 times (implementer, reviewer, orchestrator, commit script) and spawned 3–4 cold agents, giving 30–60 min per slice; the remaining ~15–18 slices would take too long. The owner asked to speed up delivery even at the cost of some steps.
- **Decision (owner-approved 2026-11-24):**
  1. **One full gate per slice.** Implementers run targeted tests plus typecheck/lint; the reviewer reads the evidence instead of re-running the gate (targeted re-runs only to settle a specific doubt). The orchestrator runs the gate once on the integrated tree before commit; `commit-slice.sh` keeps its quick gate.
  2. **Full E2E (`--full`) only at milestone close** (M1…M5) and when a slice changes shared e2e infrastructure. Intermediate slices: quick gate + `npx playwright test <slice spec(s)>` on both Chromium projects.
  3. **Fewer agents.** The implementer writes its own unit/e2e tests (no separate QA agent per slice; QA is used for milestone suites, flaky-test hardening and Lighthouse). For small slices the orchestrator may implement directly; the reviewer stays a separate agent.
  4. **Larger slices.** Remaining work regrouped (see PROGRESS.md): P3 in 2 slices, P4 in 3, P5 in 1, P6 in 2–3.
  5. **Lean review.** Diff + acceptance criteria + evidence. Screenshot comparison against Figma only for slices that deliver a new screen.
- **Not relaxed:** independent reviewer PASS before commit; never commit/push on a failed gate; no gate-script changes to make a slice pass; max two fix loops; explicit file staging.
- **Tradeoffs:** cross-slice e2e regressions may surface only at milestone close (mitigated: milestone `--full` before moving on; any regression found becomes the next slice's first fix). Fewer independent eyes on tests (mitigated: reviewer checks test quality).
- **Status:** Accepted (owner).

## ADR-009 — Delivery-deadline mode: deferred review (2026-11-24)
- **Context:** Delivery is due 2026-11-25 and the token budget is limited. Each delegated agent re-reads the repo (an implementer used ~300k tokens on P3-01); per-slice independent review plus fix loops cost 10–20 min per slice.
- **Decision (owner-approved 2026-11-24):** supersedes ADR-008 for the remaining slices.
  1. The orchestrator may implement slices directly; spawn agents only when parallelism or isolation is clearly worth it.
  2. Per slice: quick gate (`bash scripts/quality-gate.sh`, run by `commit-slice.sh`) + the slice's own Playwright specs. No per-slice independent review.
  3. **One independent review at the end** over the integrated diff since `8511e4f` (security, money/idempotency, cache isolation, a11y), followed by fixes and a final `--full` gate.
  4. Commit after every slice so `main` is always deliverable; keep README delivery status current.
  5. Priority order: commerce (cart → checkout → order receipt), profile/wallets, minimal realtime, then Lighthouse + final README. Deploy to Vercel is done by the owner after completion.
- **Not relaxed:** no commit on a failed gate; no gate-script edits; decimal ETH; idempotent orders; immutable receipts; explicit staging; push only to the owned origin.
- **Risk:** defects found only in the final review; mitigated by committing small slices and reviewing the cumulative diff before delivery.
- **Status:** Accepted (owner).
