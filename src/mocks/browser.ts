import { setupWorker } from 'msw/browser'
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
  const initial = resolveInitialScenario(window.location.search, getStorage())
  setScenario(initial.name, initial.seed)

  await worker.start({
    serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` },
    onUnhandledRequest: 'bypass',
    quiet: import.meta.env.PROD,
  })
}
