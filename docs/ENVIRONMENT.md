# Environment configuration

All values are non-secret `VITE_*` flags exposed to the browser bundle. Defaults apply when unset; override in a local, gitignored `.env.local`.

| Variable | Default | Purpose |
|---|---|---|
| `VITE_ENABLE_MOCKS` | on (unless `false`) | Start the MSW worker before render; required for the demo build (no real backend). |
| `VITE_API_BASE_URL` | `/api` | Base URL of the single Axios instance. Mocks only intercept same-origin `/api`. |
| `VITE_API_TIMEOUT_MS` | `10000` | Axios request timeout (ms). |

`.env*` files are intentionally not committed (commit-slice secret-filename guard).
