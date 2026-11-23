import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app'
import { createAppRouter, createQueryClient } from './router'
import './index.css'

/** Starts MSW before the first request. Dynamic import keeps it in its own chunk. */
async function enableMocking(): Promise<void> {
  // Mocks are on by default (demo build has no backend); set VITE_ENABLE_MOCKS=false to disable.
  if (import.meta.env.VITE_ENABLE_MOCKS === 'false') return
  const { startMockWorker } = await import('./mocks/browser')
  await startMockWorker()
}

function renderApp(): void {
  const queryClient = createQueryClient()
  const router = createAppRouter({ queryClient })

  const rootElement = document.getElementById('root')
  if (!rootElement) {
    throw new Error('Root element #root not found')
  }

  createRoot(rootElement).render(
    <StrictMode>
      <App queryClient={queryClient} router={router} />
    </StrictMode>,
  )
}

enableMocking()
  .catch((error: unknown) => {
    // Without the worker, API calls surface real network errors in the UI.
    console.error('[mocks] Failed to start the mock service worker.', error)
  })
  .finally(renderApp)
