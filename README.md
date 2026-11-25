# Kurio — NFT Marketplace (Jungle Gaming frontend challenge)

An NFT marketplace in React and TypeScript, with a simulated REST API (MSW) and realtime events (Socket.IO).

**Live demo:** https://front-test-gray.vercel.app · **Repository:** https://github.com/pedrosilvaadev/front-test

The whole "API" runs in the browser. There is no backend, but the frontend talks to it exactly as it would talk to a real server:

- **REST:** Axios → HTTP → MSW service worker.
- **Realtime:** `socket.io-client` → WebSocket intercepted by MSW.

The UI is in Portuguese (pt-BR), as in the Figma design.

Documentation:

- [`ARCHITECTURE.md`](ARCHITECTURE.md): architecture, session, cart, cache, REST ↔ Socket.IO reconciliation, limitations, UX decisions and Figma deviations.
- [`docs/API_CONTRACTS.md`](docs/API_CONTRACTS.md): REST and event contracts.
- [`docs/DECISIONS.md`](docs/DECISIONS.md): ADRs.
- [`docs/lighthouse/`](docs/lighthouse/README.md): Lighthouse audit.
- [`docs/PROGRESS.md`](docs/PROGRESS.md) and `docs/tasks/`: per-slice evidence.

## Stack
- React 19, TypeScript, Vite, Tailwind CSS v4 and shadcn/ui (Radix).
- TanStack Router (catalog state in the URL) and TanStack Query (cache, cancellation, retry).
- Axios, with a single instance and responses validated with zod (`src/contracts`).
- MSW: stateful REST handlers and a Socket.IO protocol simulation.
- `socket.io-client`.
- big.js for ETH values, which are decimal strings and never `number`.
- Vitest and Testing Library; Playwright (Chromium desktop and mobile, axe-core, visual regression); Lighthouse.

## Setup
Requires Node 22 and npm.

```bash
npm ci
npx playwright install chromium   # only for the e2e tests
npm run dev                       # http://localhost:5173 (with mocks)
```

| Command | What it does |
|---|---|
| `npm run dev` | Development with mocks (MSW and simulated Socket.IO) |
| `npm run build` / `npm run preview` | Optimized build (with mocks: this is the demo build) and local server |
| `npm run typecheck` / `npm run lint` | Type checking / ESLint |
| `npm run test -- --run` | Unit and integration tests (Vitest) |
| `npm run e2e` | Playwright on Chromium desktop and mobile; HTML report in `playwright-report/`, failure traces in `test-results/` |
| `npm run e2e:update-snapshots` | Regenerates the visual baselines (`e2e/__screenshots__/`) |
| `npm run lighthouse` | Lighthouse: 3 runs × 2 pages × 2 profiles, medians in `docs/lighthouse/` (run after `npm run build`) |
| `bash scripts/quality-gate.sh [--full]` | typecheck + lint + tests + build (`--full` adds the e2e suite) |

### Environment variables
All optional and non-secret (details in `docs/ENVIRONMENT.md`). Override them in `.env.local`.

| Variable | Default | Purpose |
|---|---|---|
| `VITE_ENABLE_MOCKS` | on | `false` turns MSW off (there is no real backend) |
| `VITE_API_BASE_URL` | `/api` | Axios base URL |
| `VITE_API_TIMEOUT_MS` | `10000` | Request timeout |

### Demo credentials (fictitious)
| User | E-mail | Password |
|---|---|---|
| Collector (has a primary MetaMask wallet) | `colecionador@kurio.test` | `Colecionador2026` |
| Creator | `nova@kurio.test` | `NovaSato2026` |

You can also create an account at `/cadastro` (sign up).

Coupons:
- `KURIO10`: 10% off;
- `LANCAMENTO`: 0.5 ETH off;
- `EXPIRADO`: rejected as expired.

Any other code is rejected as invalid.

## Mock API scenarios and reset
- **Network:** add `?scenario=<name>` to any URL. The choice is persisted in the browser; `?scenario=default` restores it.
  - `default`
  - `slow` (1.5 s)
  - `variable-latency` (out-of-order responses)
  - `server-error`
  - `offline`
  - `timeout`
- **Reset:** `POST /api/__dev/reset` restores the seed (database, scenario and realtime). Clearing the site's `localStorage` also works.

### How to reproduce the failure flows
The controls below are called with `fetch` from the app's own tab, for example in the DevTools console.

| Flow | How to reproduce |
|---|---|
| Slowness, skeletons, out-of-order responses | `?scenario=slow` or `?scenario=variable-latency`, then filter the catalog quickly |
| 5xx error, offline and timeout with retry | `?scenario=server-error`, `offline` or `timeout`; then `?scenario=default` and click "Tentar novamente" (Try again) |
| Expired session | While signed in: `fetch('/api/__dev/sessions/expire',{method:'POST'})`, then go to `/perfil` → login with a notice → back to the page |
| Price change or sold-out edition during checkout (Socket.IO) | With the NFT in the cart or at checkout: `fetch('/api/__dev/nfts/nft_001',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({price:'1.5'})})`; to sell out, use `editions:[{id:'nft_001-1of50',available:0}]` |
| Declined or pending payment | `fetch('/api/__dev/checkout',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({orderOutcome:'decline'})})`; `'pending'` keeps the order pending and `resolveDelayMs` sets the delay |
| Timeout after the order was created (idempotent recovery) | `PUT /api/__dev/checkout` with `{dropNextOrderResponses:1}` and confirm: you end up with a single order and its receipt |
| Realtime outage and reconnection | `fetch('/api/__dev/realtime',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({online:false})})` → "Reconectando…" (Reconnecting) banner; change something, then `{online:true}`: state is reconciled over REST |
| Resolve a pending order | `POST /api/__dev/orders/<id>/resolve` with `{status:'confirmed'\|'declined'}` |
| Duplicate or stale event | `POST /api/__dev/realtime/emit` with an `nft.updated` envelope (see `docs/API_CONTRACTS.md`) |

## Tests
- **Unit and integration:** 416 tests (Vitest).
- **E2E (Playwright):**
  - covers the 12 groups of the challenge README on Chromium desktop (1440×900) and mobile (Pixel 7);
  - the group → spec map is in [`docs/tasks/P6-01.md`](docs/tasks/P6-01.md);
  - every test starts from an isolated state (mock reset);
  - REST tests go through the MSW handlers and realtime tests through `socket.io-client`;
  - an axe scan (WCAG 2.1 AA) covers 9 screens;
  - visual regression covers home, NFT detail, cart and checkout.

## Lighthouse (medians of 3 runs)
| Page | Profile | Perf. | A11y | Best Pr. | SEO |
|---|---|---:|---:|---:|---:|
| Home | mobile | 75 | 100 | 100 | 100 |
| Home | desktop | 98 | 100 | 100 | 100 |
| NFT detail | mobile | 80 | 100 | 100 | 100 |
| NFT detail | desktop | 99 | 100 | 100 | 100 |

Mobile performance is below the 90 target. The causes (a client-rendered SPA without SSR, a 510 kB entry chunk and MSW on the critical path), what was done about it, LCP/CLS/TBT and next steps are in [`docs/lighthouse/README.md`](docs/lighthouse/README.md).

## Deploy (Vercel)
- **Production:** https://front-test-gray.vercel.app. The Vercel project is connected to this GitHub repository: every push to `main` deploys to production, and other branches get preview URLs.
- **Verified after deploying:**
  - direct access and refresh on `/`, `/nft/emerald-ape-042`, `/perfil`, `/checkout` and `/pedidos/:id`;
  - MSW active;
  - Socket.IO connected, with `nft.updated` applied;
  - login;
  - catalog with URL filters;
  - `robots.txt`;
  - `mockServiceWorker.js` served without caching.
- **Configuration:** "Vite" framework preset, build `npm run build`, output `dist`.
- **Routes:** `vercel.json` rewrites the SPA routes to `index.html`, so direct access and refresh work on `/nft/...`, `/perfil` and so on.
- **Mocks and realtime:** both stay enabled in the published build.
