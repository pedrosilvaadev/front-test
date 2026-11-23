import { createMemoryHistory } from '@tanstack/react-router'
import { QueryClient } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { App } from '@/app'
import { createAppRouter } from '@/router'

export function renderApp({ initialPath = '/' }: { initialPath?: string } = {}) {
  // Fresh client per test keeps caches isolated between tests.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  })
  const history = createMemoryHistory({ initialEntries: [initialPath] })
  const router = createAppRouter({ queryClient, history })
  const utils = render(<App queryClient={queryClient} router={router} />)
  return { ...utils, queryClient, router }
}
