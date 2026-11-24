import { act, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderApp } from '@/test/render-app'
import { APP_READY_TIMEOUT, APP_TEST_TIMEOUT } from '@/test/timeouts'
import { SEARCH_DEBOUNCE_MS } from './use-catalog-search-field'

/**
 * Header search fields (mobile + desktop share `useCatalogSearchField`).
 * Both headers are in the DOM under jsdom (no CSS), so the fields are picked
 * by their labels.
 */
async function renderHome() {
  const utils = renderApp()
  await screen.findByRole('list', { name: 'NFTs' }, { timeout: APP_READY_TIMEOUT })
  // Only timers are faked: the app already loaded with real ones.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  return utils
}

async function flush() {
  // Let router navigations (promise based) settle.
  await act(async () => {
    for (let i = 0; i < 10; i += 1) await Promise.resolve()
  })
}

afterEach(() => {
  vi.useRealTimers()
})

describe.each([
  ['mobile', 'Explorar coleções'],
  ['desktop', 'Buscar NFTs'],
])('%s header search', { timeout: APP_TEST_TIMEOUT }, (_name, label) => {
  async function field() {
    if (label === 'Buscar NFTs') {
      // Desktop field opens from the magnifier toggle.
      fireEvent.click(screen.getByRole('button', { name: 'Buscar' }))
    }
    return screen.getByRole('searchbox', { name: label })
  }

  it('writes ?q after the debounce, replacing the history entry', async () => {
    const { router } = await renderHome()
    const input = await field()
    const historyLength = router.history.length

    fireEvent.change(input, { target: { value: 'golden ' } })
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 50))
    expect(router.state.location.search).toEqual({})

    await act(async () => {
      vi.advanceTimersByTime(100)
    })
    await flush()
    expect(router.state.location.pathname).toBe('/')
    expect(router.state.location.search).toEqual({ q: 'golden' })
    expect(router.history.length).toBe(historyLength)
    // Trailing space typed by the user is kept.
    expect(input).toHaveValue('golden ')
  })

  it('drops a pending debounce when the route changes before it fires', async () => {
    const { router } = await renderHome()
    const input = await field()

    fireEvent.change(input, { target: { value: 'ape' } })
    await act(async () => {
      router.history.push('/outra-pagina')
    })
    await flush()
    expect(router.state.location.pathname).toBe('/outra-pagina')

    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS * 4)
    })
    await flush()
    expect(router.state.location.pathname).toBe('/outra-pagina')
    expect(router.state.location.search).toEqual({})
  })

  it('submitting from another route navigates to the catalog with q', async () => {
    const { router } = await renderHome()
    await act(async () => {
      router.history.push('/outra-pagina')
    })
    await flush()
    const input = await field()
    fireEvent.change(input, { target: { value: 'nomad' } })
    fireEvent.submit(input.closest('form')!)
    await flush()
    expect(router.state.location.pathname).toBe('/')
    expect(router.state.location.search).toEqual({ q: 'nomad' })
  })
})
