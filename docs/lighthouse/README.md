# Lighthouse audit (README §10)

Reproduce with `npm run build && npm run lighthouse`. The configuration is versioned in
`scripts/lighthouse.mjs`:

- **Build:** the optimized `vite build`, served by `vite preview`. The default mock scenario is
  active, and MSW, the Socket.IO simulation, fonts and images all load exactly as deployed.
  Nothing is disabled for the audit.
- **Pages:** home (`/`) and NFT detail (`/nft/emerald-ape-042`).
- **Profiles:**
  - `mobile`: the Lighthouse 12.6.1 default (Moto G Power emulation, simulated slow 4G at
    150 ms RTT and 1.6 Mbps, 4× CPU slowdown).
  - `desktop`: `desktop-config` (1350×940, simulated 40 ms RTT, 10 Mbps, no CPU slowdown).
- **Runs:** 3 per page and profile, each in a fresh headless Chrome profile with a cold cache and
  the service worker registered from scratch. The tables report the median.
- **Artifacts:**
  - `summary.md` and `summary.json`: every run, the medians, LCP/CLS/TBT/FCP, the tool versions
    and the throttling settings.
  - `<page>-<profile>.report.{html,json}`: the representative run, whose performance score is
    the median.
  - All raw runs are written to `lighthouse-results/`, which git ignores.

## Results (2026-11-25, medians of 3 runs)

Environment: Lighthouse 12.6.1, HeadlessChrome 158, Node 22.17.0, Windows 11 (10.0.26200),
AMD Ryzen 5 6600H, benchmarkIndex ≈ 2350.

| Page | Profile | Performance | Accessibility | Best Practices | SEO | LCP | CLS | TBT |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| home | mobile | **75** | 100 | 100 | 100 | 4.44 s | 0.001 | 125 ms |
| home | desktop | 98 | 100 | 100 | 100 | 0.96 s | 0.005 | 8 ms |
| nft-detail | mobile | **80** | 100 | 100 | 100 | 4.14 s | 0.000 | 115 ms |
| nft-detail | desktop | 99 | 100 | 100 | 100 | 0.93 s | 0.036 | 0 ms |

Targets are Performance ≥ 90, Accessibility ≥ 95, Best Practices ≥ 95 and SEO ≥ 90. Every
category on every page and profile meets them **except mobile performance** (75 and 80).

## Why mobile performance is below 90

CLS (≤ 0.036) and TBT (≈ 120 ms) are good. The mobile score is held back by **LCP ≈ 4.1–4.4 s**,
and 70–80 % of that is *render delay*: the LCP image arrives quickly, but it can only be painted
once JavaScript has produced the page. The causes, in order of weight:

1. **Client-rendered SPA with a 510 kB entry chunk (163 kB gzip).**
   - What it contains: react-dom (≈ 205 kB), zod (≈ 93 kB), TanStack Router (≈ 65 kB),
     tailwind-merge (≈ 28 kB) and TanStack Query (≈ 25 kB).
   - Why zod is there: it validates every API response at runtime (ADR-002), including the
     catalog's URL search params.
   - Effect: with a 4× CPU slowdown, parsing and evaluating this chunk is the long
     "unattributable" task before the first paint. A plain static page served the same way scores
     100, which isolates the cost to the app bundle.
2. **The mock backend runs in the page.** Every piece of data comes from MSW. The browser chunk
   (≈ 113 kB) must load and the service worker must register before the first API response, so
   the LCP image (the NFT art in the hero or gallery) is only known after
   bundle → MSW → API → render. A real backend would not pay this cost. It stays in the audit
   because the README asks for the delivered build and its mocks to be audited.
3. Desktop is unaffected (≈ 0.95 s LCP, score 98–99) because there is no CPU slowdown.

## What was changed to improve it (P6-02)

| Change | Effect |
|---|---|
| Render the app immediately; API requests and the socket wait for MSW (`src/api/network-ready.ts`) | Shell and skeletons paint while the worker boots. Mobile run-to-run spread dropped from 50–82 to 75–80. |
| Realtime bridge (socket.io-client and its handshake) mounted on `requestIdleCallback` | The socket chunk and connection no longer compete with first render or LCP. |
| `robots.txt` (and a Vercel rewrite exclusion for it) | SEO 92 → 100. |
| Earlier slices: route-level code splitting, lazy account, cart, auth and mocks chunks, eager `fetchpriority="high"` LCP image, fixed image dimensions, self-hosted subset font | CLS ≈ 0, TBT ≈ 120 ms. |

## Next steps (not done, by expected impact)

1. **Pre-render or SSR** the shell and above-the-fold content so the first paint does not wait
   for the JS bundle.
2. **Remove zod from the entry chunk:** use a hand-written validator for the catalog search
   params and load response validation with the API modules (about −93 kB on the critical path).
3. **Ship the LCP image URL with the HTML.** This needs SSR or edge data. With a mocked API it
   would be an audit-only shortcut, which the README forbids.
