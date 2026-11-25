# API contracts (REST + Socket.IO)

Source of truth for types: `src/contracts/**` (zod schemas + `z.infer` types, ADR-002). This document explains the behaviour those types cannot express. README §3–§7 and the Figma frames in `docs/design/` are authoritative; where this document deviates it says so.

- Base URL: `VITE_API_BASE_URL` (default `/api`), JSON only, UTF-8.
- Mock implementation: MSW handlers in `src/mocks/**` (P1-02+). The client never fabricates responses.
- Timestamps: ISO-8601 UTC (`2026-07-29T12:00:00.000Z`).
- Money: ETH decimal **strings** (`"1.19"`, `"0.016"`), regex `^(0|[1-9]\d*)(\.\d{1,18})?$`, never JSON numbers (ADR-003). All prices are in ETH regardless of NFT network (simulation simplification). Arithmetic: `src/lib/money.ts`.
- Quantities: JSON integers `1..999`; availability is enforced server side.
- Ids: opaque strings. UUIDs where the client generates them (`Idempotency-Key`, guest cart id, realtime `eventId`).

## Conventions

| Topic | Rule |
|---|---|
| Auth header | `Authorization: Bearer <token>` (ADR-005). |
| Guest cart header | `X-Guest-Cart-Id: <uuid>` on cart/quote calls when no bearer token. If both are present, the bearer wins and the header is ignored. |
| Idempotency header | `Idempotency-Key: <uuid>` on `POST /api/orders` (required). |
| Auth column | **public**: no token needed, token ignored. **owner**: bearer *or* guest cart id. **user**: bearer required → 401 otherwise. |
| Validation | Request bodies/queries are parsed with the same schema on the mock; failures → 422 `VALIDATION_ERROR` (body) or 400 `INVALID_QUERY` (query) with `details.fieldErrors`. Malformed JSON → 400 `INVALID_JSON`. |
| Response validation | The client parses every 2xx body with its response schema; a mismatch is a contract bug (fails loudly in dev/tests). |
| Public vs private data | Public resources (`/nfts*`) never contain user-specific fields (favorite flag, cart quantity). Private state lives in user-scoped resources. |
| Unknown route | 404 `ROUTE_NOT_FOUND` (browser fallback handler). |

## Endpoints

`→` shows the success status and body schema exported from `src/contracts`.

### Dev / test control (existing, P0-02)

| Method | Path | Auth | Request | Response | Errors |
|---|---|---|---|---|---|
| GET | `/api/health` | public | – | 200 `{ status: "ok" }` | – |
| POST | `/api/__dev/reset` | public | – | 204; restores seeded DB **and** default scenario | – |
| GET | `/api/__dev/scenario` | public | – | 200 active `NetworkScenario` | – |
| PUT | `/api/__dev/scenario` | public | `{ name: preset, seed?: int }` | 200 `NetworkScenario` | 400 `INVALID_JSON`, 422 `UNKNOWN_SCENARIO` |

Dev endpoints are never affected by the active network scenario. Domain fault scenarios (session expired, coupon expired, price change, sold out, payment declined, order timeout) are added by P1-02 as further `/api/__dev/*` controls; they must stay deterministic and be reset by `POST /api/__dev/reset`.

### Session and account — `src/contracts/session.ts`

| Method | Path | Auth | Request | Response | Errors |
|---|---|---|---|---|---|
| POST | `/api/auth/register` | public | `RegisterRequest` `{ username, email, password, guestCartId? }` | 201 `AuthResponse` `{ session, cartMerge }` | 422 `VALIDATION_ERROR`; 409 `EMAIL_TAKEN` / `USERNAME_TAKEN` (with `details.fieldErrors`) |
| POST | `/api/auth/login` | public | `LoginRequest` `{ email, password, guestCartId? }` | 200 `AuthResponse` | 422 `VALIDATION_ERROR`; 401 `INVALID_CREDENTIALS` |
| GET | `/api/auth/session` | user | – | 200 `SessionInfo` `{ user, expiresAt }` | 401 `UNAUTHORIZED` (missing/unknown token), 401 `SESSION_EXPIRED` |
| POST | `/api/auth/logout` | user | – | 204 (token revoked; idempotent: unknown/expired token also → 204) | – |

- Expiry: every `user`/`owner` endpoint answers 401 `SESSION_EXPIRED` once `expiresAt` has passed or the dev control forced expiry. The client then clears private caches, keeps the current location, checkout draft **and persisted checkout attempts** (idempotency key + order id, see Orders) and redirects to login with `redirect=<current url>` (ADR-005).
- `INVALID_CREDENTIALS` is also 401 but is **not** a session event: global 401 handling must branch on `code` and ignore it.
- `cartMerge` (ADR-006) is `null` when no `guestCartId` was sent or that cart was empty/unknown.
- Registration defaults (the "Cadastro" form only collects username, email, password): `displayName = username`, `avatarUrl = null`; the profile starts with `ensName = null`, `walletNickname = null`.

### NFTs (catalog) — `src/contracts/nfts.ts`

| Method | Path | Auth | Request | Response | Errors |
|---|---|---|---|---|---|
| GET | `/api/nfts` | public | query `CatalogQuery` (below) | 200 `NftListResponse` `{ items: NftSummary[], page, query, facets }` | 400 `INVALID_QUERY` |
| GET | `/api/nfts/featured` | public | – | 200 `NftSummaryList` (hero carousel + "NFT em destaque") | – |
| GET | `/api/nfts/:idOrSlug` | public | – | 200 `NftDetail` | 404 `NFT_NOT_FOUND` |
| GET | `/api/nfts/:idOrSlug/related` | public | – | 200 `NftSummaryList` ("Mais desta coleção", "Colecionadores também viram") | 404 `NFT_NOT_FOUND` |

Catalog query parameters (all optional; lists are comma separated; defaults omitted from URLs via `serializeCatalogQuery`):

| Param | Type | Default | Notes |
|---|---|---|---|
| `q` | string ≤100 | – | Case-insensitive match on name, collection, token id. Trimmed; empty = absent. |
| `categories` | csv of `digital-art, photography, music, 3d-art, collectibles, generative, gaming, subscriptions, utility` | `[]` | OR within the list. |
| `networks` | csv of `ethereum, polygon, solana` | `[]` | OR within the list; AND with other filters. |
| `minPrice`, `maxPrice` | ETH string | – | Inclusive; `minPrice > maxPrice` → 400. Normalized to canonical form (`12.30` → `12.3`) so equivalent URLs share one query key. |
| `tab` | `all` \| `new` \| `trending` | `all` | "Todos os NFTs" / "Novos lançamentos" / "Em alta" (flags `isNew` / `isTrending`). |
| `sort` | `recent` \| `price-asc` \| `price-desc` \| `name-asc` | `recent` | "Listados recentemente" = `listedAt` desc. Ties broken by `id` for deterministic pages. |
| `page` | digits only, ≥1 | 1 | Page past the end → 200 with empty `items`. `1.5`, `1e1`, `0x10`, ` 2`, `""` → 400. |
| `pageSize` | digits only, 1..48 | 9 | |

- The response echoes the normalized `query`; the UI ignores a response whose `query` differs from the current one (out-of-order guard in addition to Query cancellation).
- Changing any filter/sort/search resets `page` to 1 (client rule, README §3).
- `facets` counts are computed over listings matching `q` + `tab` only, so sidebar counts stay stable while toggling filters; `priceRange` gives slider bounds.
- Edition availability, `maxPerOrder` and `version` come from the detail; `version` increases on every price/availability change (same counter as `nft.updated`).
- Edition invariants (enforced by `editionSchema`): `unique` → `supply = 1`, `available ∈ {0,1}`; `limited` → `supply ≥ 2`, `0 ≤ available ≤ supply`; `open` ("ABERTA") → `supply = null` (uncapped edition) and `available` = remaining allocation of the current sale window (finite so the simulation can sell out). `available` excludes units reserved by pending orders.

### Favorites — `src/contracts/favorites.ts`

| Method | Path | Auth | Request | Response | Errors |
|---|---|---|---|---|---|
| GET | `/api/favorites` | user | – | 200 `FavoriteList` (newest first, each with `nft: NftSummary`) | 401 |
| PUT | `/api/favorites/:nftId` | user | – | 200 `FavoriteStatus` `{ nftId, favorited: true }` (idempotent) | 401, 404 `NFT_NOT_FOUND` |
| DELETE | `/api/favorites/:nftId` | user | – | 200 `FavoriteStatus` `{ nftId, favorited: false }` (idempotent) | 401 |

PUT/DELETE are idempotent so an optimistic toggle can be retried safely; this is the designated optimistic-update + rollback interaction (README §4).

### Cart — `src/contracts/cart.ts`

| Method | Path | Auth | Request | Response | Errors |
|---|---|---|---|---|---|
| GET | `/api/cart` | owner | – | 200 `Cart` (empty cart if none yet) | 400 `GUEST_CART_ID_REQUIRED`, 401 |
| POST | `/api/cart/items` | owner | `AddCartItemRequest` `{ nftId, editionId, quantity }` (adds to an existing line) | 200 `Cart` | 422, 404 `NFT_NOT_FOUND` / `EDITION_NOT_FOUND`, 409 `AVAILABILITY_CONFLICT` |
| PATCH | `/api/cart/items/:itemId` | owner | `UpdateCartItemRequest` `{ quantity }` (absolute) | 200 `Cart` | 422, 404 `CART_ITEM_NOT_FOUND`, 409 `AVAILABILITY_CONFLICT` |
| DELETE | `/api/cart/items/:itemId` | owner | – | 200 `Cart` (idempotent: missing line → 200) | – |
| PUT | `/api/cart/coupon` | owner | `ApplyCouponRequest` `{ code }` | 200 `Cart` | 422 `COUPON_INVALID` / `COUPON_EXPIRED` |
| DELETE | `/api/cart/coupon` | owner | – | 200 `Cart` | – |

- Lines are unique per `(nftId, editionId)`; `nft.maxQuantity = min(available, edition.maxPerOrder)`.
- `AVAILABILITY_CONFLICT.details`: `AvailabilityConflictDetails` `{ nftId, editionId, requested, available, maxQuantity }`. The cart is unchanged on any error.
- The cart contains **no totals**: subtotal/discount/fee/total come from the quote.
- `version` increases on every mutation, including server-side changes (purchase confirmation removing items).
- Every mutation returns the full cart, so the client replaces the cache entry instead of patching.

### Quote — `src/contracts/quote.ts`

| Method | Path | Auth | Request | Response | Errors |
|---|---|---|---|---|---|
| POST | `/api/quotes` | owner | `QuoteRequest` `{ network = "ethereum", previousQuoteId? }` | 201 `Quote` | 422, 404 `QUOTE_NOT_FOUND` (unknown `previousQuoteId`) |

- Prices the caller's **current** cart: lines (`lineTotal = unitPrice × quantity`), coupon re-validation, `discount` (percent rounded half-up to 18 dp, or fixed, capped at subtotal), `networkFee` (simulated per network; ethereum `0.016`), `total = max(subtotal − discount, 0) + networkFee`.
- Side-effect free; valid for 5 minutes (`expiresAt`). `purchasable = false` when the cart is empty or a line exceeds availability.
- With `previousQuoteId`, `changes[]` lists `QuoteChange`s: `price_changed`, `availability_changed`, `item_unavailable`, `coupon_invalidated`, `fee_changed`. An expired/invalid coupon does not fail the quote; it is dropped and reported as `coupon_invalidated`.
- Cart page and checkout display the quote; it is re-requested whenever the cart `version`, network, or a relevant `nft.updated` changes.

### Orders — `src/contracts/orders.ts`

| Method | Path | Auth | Headers | Request | Response | Errors |
|---|---|---|---|---|---|---|
| POST | `/api/orders` | user | `Idempotency-Key` | `CreateOrderRequest` `{ quoteId, network, walletId, buyer, note? }` | 201 `Order` (new, `pending`) · 200 `Order` + `Idempotent-Replayed: true` (replay) | 400 `IDEMPOTENCY_KEY_REQUIRED`; 422; 404 `QUOTE_NOT_FOUND` / `WALLET_NOT_FOUND`; 409 `IDEMPOTENCY_CONFLICT`, `QUOTE_EXPIRED`, `QUOTE_CHANGED`, `AVAILABILITY_CONFLICT`, `WALLET_NETWORK_MISMATCH`, `WALLET_NOT_CONNECTED` |
| GET | `/api/orders/:orderId` | user | – | – | 200 `Order` | 404 `ORDER_NOT_FOUND`, 403 `FORBIDDEN` (order of another user) |
| GET | `/api/orders?status=pending` | user | – | `status?` | 200 `OrderList` (newest first) | 400 `INVALID_QUERY` |

**Idempotency** (README §5):
1. The key is scoped to the user. The server stores `key → { fingerprint, orderId }`, where fingerprint = canonical JSON (sorted keys) of the parsed request body.
2. Same key + same fingerprint → the **same order** in its current state (200, `Idempotent-Replayed: true`), even if the quote has since expired or prices changed. No second reservation.
3. Same key + different fingerprint → 409 `IDEMPOTENCY_CONFLICT`; nothing is created.
4. Keys are checked **before** quote revalidation, so a retry after a timeout always recovers the original order.
5. Client: one key per checkout attempt (per `quoteId`), generated on first submit and persisted **before** the request is sent as `checkoutAttempt = { userId, quoteId, idempotencyKey, payload, orderId? }` (`localStorage`, keyed by user id, so it survives reload and re-login). It is reused for retries after timeout/network errors, after reload, and after `SESSION_EXPIRED` → re-login **as the same user**. `orderId` is stored as soon as any response returns the order.
6. **Before generating a new key** (new submit, re-confirmed quote) the client must resolve the previous attempt: if one exists for this user, first replay it (same key + same payload) or read `GET /api/orders/:orderId` / `GET /api/orders?status=pending`. Only when the previous attempt is known to be terminal, never reached the server (replay → 404 `QUOTE_NOT_FOUND`/409 `QUOTE_CHANGED`/`QUOTE_EXPIRED` without an order), or was rejected by revalidation, may a new key be generated. A re-confirmed quote is a new attempt with a new key.
7. Attempts are deleted when the order is terminal, on **explicit logout**, or when a **different** user signs in. They are **kept** on `SESSION_EXPIRED` and on re-login as the same user (ADR-004/ADR-005).
8. Submit buttons are disabled while in flight (double-click guard on top of idempotency).

**Revalidation before confirming** (README §3, §7): on creation the server re-prices the cart and compares it to `quoteId`:
- quote older than `expiresAt` → 409 `QUOTE_EXPIRED` (client requests a new quote and asks for confirmation);
- any price/fee/coupon difference → 409 `QUOTE_CHANGED`, `details: QuoteChangedDetails { changes[], quote }` (fresh quote). The UI shows the changes and requires an explicit new confirmation, which submits the new `quoteId` with a new key;
- a line no longer fulfillable → 409 `AVAILABILITY_CONFLICT` with the same `QuoteChangedDetails` shape (`availability_changed` / `item_unavailable`);
- `network` ≠ quote network or ≠ the wallet's `network` → 409 `WALLET_NETWORK_MISMATCH`; wallet without an active connection → 409 `WALLET_NOT_CONNECTED`.

**Lifecycle:** `pending` → `confirmed` | `declined` (both terminal, never change again). Stock is reserved at creation, committed on confirmation, released on decline. On confirmation the server removes exactly the purchased quantities from the cart (bumping cart `version`); on decline/failure the cart is untouched. Every transition bumps `version` and emits `order.updated`. `receipt` is an immutable snapshot taken at creation; catalog changes never alter it. Status-dependent fields are enforced by a discriminated union (`orderSchema`, and the same for `order.updated` data): `pending` → `transaction: null, decline: null`; `confirmed` → `transaction` required (simulated hash + **https** explorer URL), `decline: null`; `declined` → `decline` required, `transaction: null`. The confirmation screen is shown only for `status === "confirmed"`.

**Recovery:** after refresh/reconnect/re-login the client re-reads `GET /api/orders/:orderId` for a persisted attempt with an `orderId`, replays the persisted attempt (same key + payload) when the order id is unknown (timeout before any response), or lists `GET /api/orders?status=pending`; it never re-POSTs the same attempt with a new key.

### Profile — `src/contracts/profile.ts`

| Method | Path | Auth | Request | Response | Errors |
|---|---|---|---|---|---|
| GET | `/api/profile` | user | – | 200 `Profile` | 401 |
| PUT | `/api/profile` | user | `UpdateProfileRequest` `{ displayName, username, email, ensName \| null, walletNickname }` (`walletNickname` required on save) | 200 `Profile` | 422; 409 `EMAIL_TAKEN` / `USERNAME_TAKEN` |
| PUT | `/api/profile/avatar` | user | `UpdateAvatarRequest` `{ dataUrl }` (png/jpeg/webp, ≤ ~512 KiB) | 200 `Profile` | 422 |
| DELETE | `/api/profile/avatar` | user | – | 200 `Profile` (`avatarUrl: null`) | – |
| POST | `/api/profile/password` | user | `ChangePasswordRequest` `{ currentPassword, newPassword }` | 204 | 422 `VALIDATION_ERROR`, 422 `CURRENT_PASSWORD_INVALID` (`fieldErrors.currentPassword`) |

`Profile.walletNickname` and `Profile.ensName` are nullable (null after registration); the form requires `walletNickname` when saving. Profile changes to `displayName`/`username`/`email`/`avatarUrl` are reflected by `GET /api/auth/session` (client invalidates the session query). Passwords are never returned and are stored hashed by the mock (ADR-005).

### Wallets — `src/contracts/wallets.ts`

| Method | Path | Auth | Request | Response | Errors |
|---|---|---|---|---|---|
| GET | `/api/wallets` | user | – | 200 `WalletsResponse` `{ primary: Wallet \| null, secondary: Wallet \| null }`; each `Wallet` carries `connection: WalletConnection \| null` | 401 |
| PUT | `/api/wallets/:slot` | user | `WalletInput` | 201 `Wallet` (created) · 200 `Wallet` (updated) | 422 (`address` must match `network`); 409 `PRIMARY_WALLET_REQUIRED` (secondary before primary) |
| POST | `/api/wallets/:slot/connection` | user | `WalletConnectRequest` `{ network }` | 200 `WalletConnection` | 404 `WALLET_NOT_FOUND`; 409 `WALLET_CONNECTION_REJECTED` (simulated refusal); 409 `WALLET_NETWORK_MISMATCH` (`network` ≠ wallet `network`) |
| DELETE | `/api/wallets/:slot/connection` | user | – | 204 (idempotent) | – |

- `:slot` is `primary` | `secondary`. "Igual à carteira principal" is a client-side copy of the primary values into the secondary form.
- Fields mirror the Figma form; required markers in the design are kept (`referralCode`, `ensName` required, `alternateAddress` optional).
- **Connection state is server-side** and returned in `Wallet.connection` (null = disconnected), so connected/disconnected survives refresh. A `PUT` that changes `network` or `address` drops the connection. A rejected connect leaves `connection: null`. A dev control can force disconnection to exercise the flow. `walletSchema` checks that `connection` references the same wallet, slot and network.
- **Network compatibility:** a wallet belongs to exactly one network. It can be connected only on that network, and an order may use it only when `order.network === wallet.network === quote.network` (else 409 `WALLET_NETWORK_MISMATCH`) and its connection is active (else 409 `WALLET_NOT_CONNECTED`). The checkout network selector therefore filters/derives the usable wallets.

## Errors

Envelope (unchanged from P0-02, `src/api/errors.ts`; schema `errorEnvelopeSchema`):

```json
{ "error": { "code": "QUOTE_CHANGED", "message": "Prices changed. Review and confirm again.", "details": { } } }
```

The HTTP status determines `ApiError.kind` via `kindFromStatus`; `code` refines it. Machine-readable catalogue: `ERROR_CATALOGUE` in `src/contracts/common/errors.ts` (a unit test asserts each code's status maps to its kind).

| Kind (`ApiError.kind`) | Status | Codes | `details` | Retry |
|---|---|---|---|---|
| validation | 400 | `INVALID_JSON`, `INVALID_QUERY`, `IDEMPOTENCY_KEY_REQUIRED`, `GUEST_CART_ID_REQUIRED` | `FieldErrorsDetails` for `INVALID_QUERY` | no |
| validation | 422 | `VALIDATION_ERROR`, `COUPON_INVALID`, `COUPON_EXPIRED`, `CURRENT_PASSWORD_INVALID`, `UNKNOWN_SCENARIO` | `FieldErrorsDetails` `{ fieldErrors: { "<path>": string[] }, formErrors? }` | no |
| unauthorized | 401 | `UNAUTHORIZED`, `SESSION_EXPIRED`, `INVALID_CREDENTIALS` | – | no; session flow (except `INVALID_CREDENTIALS`) |
| forbidden | 403 | `FORBIDDEN` | – | no |
| not_found | 404 | `NFT_NOT_FOUND`, `EDITION_NOT_FOUND`, `CART_ITEM_NOT_FOUND`, `QUOTE_NOT_FOUND`, `ORDER_NOT_FOUND`, `WALLET_NOT_FOUND`, `ROUTE_NOT_FOUND` | – | no |
| conflict | 409 | `EMAIL_TAKEN`, `USERNAME_TAKEN` | `FieldErrorsDetails` | no |
| conflict | 409 | `AVAILABILITY_CONFLICT` | cart: `AvailabilityConflictDetails`; order: `QuoteChangedDetails` | no; user decision |
| conflict | 409 | `QUOTE_CHANGED` | `QuoteChangedDetails` `{ changes[], quote }` | no; re-confirm |
| conflict | 409 | `QUOTE_EXPIRED`, `IDEMPOTENCY_CONFLICT`, `PRIMARY_WALLET_REQUIRED`, `WALLET_NOT_CONNECTED`, `WALLET_CONNECTION_REJECTED`, `WALLET_NETWORK_MISMATCH` | – | no |
| transient | 429 / 500 / 503 | `RATE_LIMITED`, `INTERNAL_ERROR`, `SERVER_UNAVAILABLE` | – | yes (queries: auto; order POST: same key) |
| network / timeout / canceled | – | client-side `NETWORK_ERROR`, `TIMEOUT`, `CANCELED` | – | network/timeout yes; canceled is not a failure |

`message` is safe to display but UI copy should be chosen per `code` (Portuguese UI). Field errors are bound to inputs by path (`aria-describedby`).

## Realtime (Socket.IO) — `src/contracts/realtime.ts`

- Client: `socket.io-client` (`Socket<ServerToClientEvents, ClientToServerEvents>`), connected to the MSW Socket.IO binding in mocks (P5 documents transport limitations). Handshake `auth: SocketAuth { token? }`; guests connect without a token and receive only public events. Private events go to room `user:<userId>`.
- One socket per session: created after the session is known, **disconnected and listeners removed on logout / user switch / token expiry**, then recreated for the next session.
- No client → server events; reconciliation uses REST.
- Transport (P5-01): Socket.IO `path` `/realtime/socket.io/`, `transports: ['websocket']`, reconnection backoff 0.5–2 s. The mock (`src/mocks/realtime-server.ts`) speaks Engine.IO v4 / Socket.IO v5 over the MSW-intercepted WebSocket: `CONNECT` with an invalid/expired token → `CONNECT_ERROR { message: 'UNAUTHORIZED' | 'SESSION_EXPIRED' }`; guests (no token) are accepted. Events are produced from db commits (any NFT/order version bump). Limitations: one namespace, no long-polling, no connection-state recovery (missed events → REST reconciliation), one server per tab (other tabs' changes arrive over REST).
- Dev controls (mock only): `GET /api/__dev/realtime` → `{ online, connections: [{ userId }] }`; `PUT /api/__dev/realtime { online }` (false drops sockets and refuses reconnections); `POST /api/__dev/realtime/emit <envelope>` pushes a hand-built `nft.updated`/`order.updated` (stale/duplicate tests) → `{ delivered }`. `POST /api/__dev/reset` keeps NFT versions monotonic.

Envelope (all events):

| Field | Type | Meaning |
|---|---|---|
| `eventId` | uuid | Stable identity; duplicates (same id) are dropped (bounded LRU of seen ids). |
| `type` | `"nft.updated"` \| `"order.updated"` | Same as the Socket.IO event name. |
| `schemaVersion` | `1` | Payload contract version. Unknown versions are ignored and trigger REST reconciliation. |
| `resource` | `{ type: "nft" \| "order", id }` | Affected resource. |
| `version` | int | Monotonic per resource, same counter as the REST `version`. Apply only if `version > cached version` (`isNewerVersion`); otherwise ignore (stale or duplicate). |
| `occurredAt` | ISO timestamp | Informational only, never used for ordering. |
| `data` | per event | Full new state of the changed fields (not a delta). |

| Event | Audience | `data` | Client effect |
|---|---|---|---|
| `nft.updated` | broadcast | `{ nftId, price, previousPrice, totalAvailable, editions: [{ editionId, available }] }` | Patch cached `NftSummary`/`NftDetail` if newer; invalidate cart + quote when the NFT is in the cart; announce the change (`aria-live`). An open checkout is blocked from confirming until a fresh quote is acknowledged. |
| `order.updated` | `user:<id>` | `{ orderId, userId, status, transaction, decline, updatedAt }` | Ignore if `userId` ≠ current session user; patch the order if newer; on `confirmed` show the receipt and invalidate cart/quote; on `declined` show the refusal. Terminal states are never regressed. |

Reconnection: on `connect` after a disconnect, invalidate active catalog/detail queries, cart, quote and any pending order (`GET /api/orders/:id`), so REST state wins over anything missed.

## Cache and query keys

Detailed policy in ADR-004. Key shapes (arrays, most general first, normalized params last):

| Data | Query key | Scope |
|---|---|---|
| Session | `['session']` | per tab; value includes `user.id` |
| Catalog list | `['catalog', 'list', CatalogQuery]` (normalized with `catalogQuerySchema`) | public |
| Featured | `['catalog', 'featured']` | public |
| NFT detail | `['catalog', 'detail', idOrSlug]` | public |
| Related | `['catalog', 'related', idOrSlug]` | public |
| Cart | `['cart', ownerKey]` with `ownerKey = 'user:<id>' \| 'guest:<uuid>'` | owner |
| Quote | `['cart', ownerKey, 'quote', { network, cartVersion }]` | owner |
| Favorites | `['user', userId, 'favorites']` | private |
| Profile | `['user', userId, 'profile']` | private |
| Wallets | `['user', userId, 'wallets']` | private |
| Order | `['user', userId, 'orders', orderId]` | private |
| Orders list | `['user', userId, 'orders', 'list', { status }]` | private |

On logout/user switch/session expiry: cancel then remove `['user']`, `['cart']` and `['session']`; disconnect the socket. Public `['catalog']` entries may be kept. Persisted storage is treated differently (ADR-004):

| Event | Query cache + socket | Checkout draft (`sessionStorage`) | Checkout attempts (idempotency key + order id) |
|---|---|---|---|
| `SESSION_EXPIRED` / `UNAUTHORIZED` | cleared | kept | **kept** |
| Re-login as the same user | – | restored | **kept and resolved before any new key** |
| Explicit logout | cleared | cleared | cleared |
| Login as a different user | cleared | previous user's cleared | previous user's cleared |
