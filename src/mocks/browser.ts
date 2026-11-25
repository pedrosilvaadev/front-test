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

export async function startMockWorker(): Promise<void> {
  const storage = getStorage()
  // Restore the persisted simulated server state (falls back to the seed).
  initDb(storage)
  const initial = resolveInitialScenario(window.location.search, storage)
  setScenario(initial.name, initial.seed)
  enableOrderAutoSettle()

  await worker.start({
    serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` },
    onUnhandledRequest: 'bypass',
    quiet: import.meta.env.PROD,
  })
}
