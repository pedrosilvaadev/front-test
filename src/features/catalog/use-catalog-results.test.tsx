import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, renderHook, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { listNfts } from '@/api/nfts'
import { server } from '@/mocks/node'
import { setScenario } from '@/mocks/scenario'
import { renderApp } from '@/test/render-app'
import { parseCatalogSearch } from './catalog-search'
import { useCatalogResults } from './use-catalog-results'

/** Makes every `GET /api/nfts` answer with a valid response echoing another query. */
async function serveResponseForMusic() {
  const music = await listNfts({ categories: ['music'] })
  server.use(http.get('*/api/nfts', () => HttpResponse.json(music)))
  return music
}

describe('useCatalogResults out-of-order guard', () => {
  it('never exposes a response whose echoed query differs from the requested one', async () => {
    const music = await serveResponseForMusic()
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(() => useCatalogResults(parseCatalogSearch({})), { wrapper })

    await waitFor(() => expect(result.current.latest).toEqual(music))
    expect(result.current.current).toBeUndefined()
    expect(result.current.isError).toBe(false)
  })

  it('the catalog keeps skeletons instead of rendering the mismatched items', async () => {
    await serveResponseForMusic()
    renderApp()
    await waitFor(() => expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-busy', 'false'), { timeout: 5000 })
    expect(screen.getByTestId('catalog-skeleton')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'NFTs' })).not.toBeInTheDocument()
    expect(screen.queryByText('Golden Signal #160')).not.toBeInTheDocument()
  })
})

describe('catalog background update state', () => {
  it('marks the results busy with the "Atualizando" indicator until the new query lands', async () => {
    renderApp()
    await screen.findByRole('list', { name: 'NFTs' }, { timeout: 5000 })
    const panel = screen.getByRole('tabpanel')
    const indicator = screen.getByTestId('catalog-updating')
    expect(panel).toHaveAttribute('aria-busy', 'false')
    expect(indicator).toHaveClass('opacity-0')

    setScenario({ name: 'test-slow', latency: { type: 'fixed', ms: 400 }, failure: { type: 'none' }, seed: 1 })
    fireEvent.click(screen.getByRole('checkbox', { name: /Fotografia/ }))

    await waitFor(() => expect(panel).toHaveAttribute('aria-busy', 'true'))
    expect(indicator).toHaveClass('opacity-100')
    expect(indicator).toHaveTextContent('Atualizando')
    // Previous items are not shown for the new query; facets stay on screen.
    expect(screen.getByTestId('catalog-skeleton')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /Arte digital/ })).toHaveAccessibleName(/\(7/)

    await waitFor(() => expect(panel).toHaveAttribute('aria-busy', 'false'), { timeout: 3000 })
    expect(indicator).toHaveClass('opacity-0')
    expect(screen.getByRole('status')).toHaveTextContent(/^5 NFTs encontrados$/)
  })
})
