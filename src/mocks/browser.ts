import { setupWorker } from 'msw/browser'
import { initDb } from './db'
import { enableOrderAutoSettle } from './order-store'
import { handlers } from './handlers'
import { unknownApiRouteHandler } from './handlers/fallback'
import { resolveInitialScenario, setScenario } from './scenario'

export const worker = setupWorker(...handlers, unknownApiRouteHandler)

function getStorage(): Storage | undefined {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

/** `initialSearch`: the query string at boot (the router may canonicalize the URL before this runs). */
export async function startMockWorker(initialSearch = window.location.search): Promise<void> {
  const storage = getStorage()
  // Restore the persisted simulated server state (falls back to the seed).
  initDb(storage)
  const initial = resolveInitialScenario(initialSearch, storage)
  setScenario(initial.name, initial.seed)
  enableOrderAutoSettle()

  await worker.start({
    serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` },
    onUnhandledRequest: 'bypass',
    quiet: import.meta.env.PROD,
  })
  // Observable readiness (E2E fixtures wait for it before calling dev endpoints directly).
  document.documentElement.dataset.mocks = 'ready'
}
