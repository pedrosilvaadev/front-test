import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderApp } from '@/test/render-app'
import { APP_READY_TIMEOUT, APP_TEST_TIMEOUT } from '@/test/timeouts'

describe('Home page', { timeout: APP_TEST_TIMEOUT }, () => {
  it('shows the second featured NFT in the "NFT em destaque" card', async () => {
    renderApp()
    const card = await screen.findByTestId('featured-nft', {}, { timeout: APP_READY_TIMEOUT })
    expect(within(card).getByRole('heading', { name: 'NFT em destaque' })).toBeInTheDocument()
    expect(card).toHaveTextContent('Oferta limitada')
    const link = await within(card).findByRole('link', {}, { timeout: APP_READY_TIMEOUT })
    expect(link).toHaveAttribute('href', '/nft/sage-nomad-009')
    expect(within(link).getByRole('img')).toHaveAccessibleName(/^Sage Nomad #009/)
    // Rendered under the filter sidebar, inside the catalog's left column.
    const sidebar = screen.getByRole('complementary', { name: 'Filtros' })
    expect(sidebar.parentElement).toContainElement(card)
  })

  it('promo banners link to catalog filters', async () => {
    const { router } = renderApp()
    const promos = await screen.findByTestId('promo-banners', {}, { timeout: APP_READY_TIMEOUT })
    const genesis = within(promos).getByRole('link', { name: /Explorar\s*Lançamentos gênesis/ })
    const digital = within(promos).getByRole('link', { name: /Explorar\s*Arte digital selecionada/ })
    expect(genesis).toHaveAttribute('href', '/?tab=new')
    expect(digital).toHaveAttribute('href', '/?categories=digital-art')

    fireEvent.click(digital)
    await waitFor(() => expect(router.state.location.search).toEqual({ categories: 'digital-art' }), { timeout: APP_READY_TIMEOUT })
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /Arte digital/ })).toBeChecked(), { timeout: APP_READY_TIMEOUT })

    fireEvent.click(within(promos).getByRole('link', { name: /Explorar\s*Lançamentos gênesis/ }))
    await waitFor(() => expect(router.state.location.search).toEqual({ tab: 'new' }), { timeout: APP_READY_TIMEOUT })
  })

  it('renders the "Diário da Cunhagem" with four unavailable "Ler mais" links', async () => {
    renderApp()
    const journal = await screen.findByTestId('mint-journal', {}, { timeout: APP_READY_TIMEOUT })
    expect(within(journal).getByRole('heading', { level: 2, name: 'Diário da Cunhagem' })).toBeInTheDocument()
    const articles = within(journal).getAllByRole('article')
    expect(articles).toHaveLength(4)
    for (const article of articles) {
      expect(within(article).getByRole('heading', { level: 3 })).toBeInTheDocument()
      const more = within(article).getByRole('link', { name: /Ler mais/ })
      expect(more).toHaveAttribute('aria-disabled', 'true')
      expect(more).not.toHaveAttribute('href')
      // Decorative art (alt="", role presentation), lazy below the fold.
      const img = article.querySelector('img')
      expect(img).toHaveAttribute('alt', '')
      expect(img).toHaveAttribute('loading', 'lazy')
    }
    expect(articles[0]).toHaveTextContent('Como funciona a propriedade de NFTs')
  })

  it('EXPLORAR moves focus to the catalog', async () => {
    renderApp()
    const hero = await screen.findByTestId('home-hero', {}, { timeout: APP_READY_TIMEOUT })
    fireEvent.click(within(hero).getByRole('link', { name: /EXPLORAR/ }))
    expect(document.getElementById('catalogo')).toHaveFocus()
  })
})
