import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { setNetworkReady } from './api/network-ready'
import { App } from './app'
import { createAppRouter, createQueryClient } from './router'
import './index.css'

/** Starts MSW (own chunk via dynamic import). Requests wait for it through `setNetworkReady`. */
async function enableMocking(initialSearch: string): Promise<void> {
  // Mocks are on by default (demo build has no backend); set VITE_ENABLE_MOCKS=false to disable.
  if (import.meta.env.VITE_ENABLE_MOCKS === 'false') return
  const { startMockWorker } = await import('./mocks/browser')
  await startMockWorker(initialSearch)
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

// Render right away (shell + skeletons paint while MSW boots); API requests and
// the realtime socket wait for the worker through `whenNetworkReady()` (P6-02).
setNetworkReady(
  // Captured before the first render: the router may rewrite `?scenario=` away.
  enableMocking(window.location.search).catch((error: unknown) => {
    // Without the worker, API calls surface real network errors in the UI.
    console.error('[mocks] Failed to start the mock service worker.', error)
  }),
)
renderApp()
