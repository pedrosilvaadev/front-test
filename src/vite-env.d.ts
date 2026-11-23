/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** `'true'` starts the MSW service worker before the app renders (dev + demo build). */
  readonly VITE_ENABLE_MOCKS?: string
  /** Base URL for the single Axios instance. Defaults to `/api`. */
  readonly VITE_API_BASE_URL?: string
  /** Axios request timeout in milliseconds. Defaults to 10000. */
  readonly VITE_API_TIMEOUT_MS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
