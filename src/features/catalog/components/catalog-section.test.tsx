import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { setScenario } from '@/mocks/scenario'
import { queryKeys } from '@/lib/query-keys'
import { parseCatalogSearch } from '../catalog-search'
import { renderApp } from '@/test/render-app'

async function cardTitles() {
  const list = await screen.findByRole('list', { name: 'NFTs' }, { timeout: 5000 })
  return within(list)
    .getAllByRole('heading', { level: 3 })
    .map((heading) => heading.textContent)
}

describe('CatalogSection', () => {
  it('renders the first page from the API with facets and pagination', async () => {
    renderApp()
    const titles = await cardTitles()
    expect(titles).toHaveLength(9)
    expect(titles[0]).toBe('Emerald Ape #042')
    expect(screen.getByRole('status')).toHaveTextContent('48 NFTs encontrados, página 1 de 6')
    const pagination = screen.getByRole('navigation', { name: 'Paginação' })
    expect(within(pagination).getByRole('link', { name: 'Página 1' })).toHaveAttribute('aria-current', 'page')
    expect(within(pagination).getByRole('link', { name: 'Página 2' })).toHaveAttribute('href', '/?page=2')
    expect(screen.getByRole('checkbox', { name: /Arte digital/ })).not.toBeChecked()
  })

  it('reads filters from the URL and caches under the normalized key', async () => {
    const { queryClient } = renderApp({ initialPath: '/?categories=music,music&networks=solana&sort=price-asc' })
    const titles = await cardTitles()
    expect(titles[0]).toBe('Golden Signal #160')
    expect(screen.getByRole('checkbox', { name: /Música/ })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /Solana/ })).toBeChecked()
    const key = queryKeys.catalog.list(parseCatalogSearch({ categories: 'music', networks: 'solana', sort: 'price-asc' }))
    expect(queryClient.getQueryData(key)).toBeDefined()
  })

  it('toggling a filter writes the URL and resets the page', async () => {
    const { router } = renderApp({ initialPath: '/?page=2' })
    await cardTitles()
    fireEvent.click(screen.getByRole('checkbox', { name: /Fotografia/ }))
    await waitFor(() => expect(router.state.location.search).toEqual({ categories: 'photography' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/NFTs encontrados$/))
  })

  it('shows the empty state and clears filters', async () => {
    const { router } = renderApp({ initialPath: '/?q=zzzz-no-match&tab=new' })
    expect(await screen.findByRole('heading', { name: 'Nenhum NFT encontrado' })).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'Limpar filtros' })[0]!)
    await waitFor(() => expect(router.state.location.search).toEqual({ tab: 'new' }))
  })

  it('shows an error with retry that recovers', async () => {
    setScenario('server-error')
    renderApp()
    const alert = await screen.findByRole('alert', {}, { timeout: 5000 })
    expect(alert).toHaveTextContent('Não foi possível carregar os NFTs')
    setScenario('default')
    fireEvent.click(within(alert).getByRole('button', { name: 'Tentar novamente' }))
    expect(await cardTitles()).toHaveLength(9)
  })
})
