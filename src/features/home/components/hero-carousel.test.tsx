import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { queryKeys } from '@/lib/query-keys'
import { featuredNfts } from '@/mocks/catalog'
import { getDb } from '@/mocks/db'
import { apiPath } from '@/mocks/http'
import { server } from '@/mocks/node'
import { setScenario, SCENARIO_PRESETS } from '@/mocks/scenario'
import { renderApp } from '@/test/render-app'
import { APP_READY_TIMEOUT, APP_TEST_TIMEOUT } from '@/test/timeouts'

async function readyHero() {
  const hero = await screen.findByTestId('home-hero', {}, { timeout: APP_READY_TIMEOUT })
  await waitFor(() => expect(hero).toHaveAttribute('data-state', 'ready'), { timeout: APP_READY_TIMEOUT })
  return hero
}

/** Slide groups include hidden ones (only the active slide is rendered visible). */
function slides(hero: HTMLElement) {
  return within(hero).getAllByRole('group', { hidden: true }).filter((el) => el.getAttribute('aria-roledescription') === 'slide')
}

function visibleSlide(hero: HTMLElement) {
  const visible = slides(hero).filter((slide) => !slide.hidden)
  expect(visible).toHaveLength(1)
  return visible[0]!
}

function dot(hero: HTMLElement, n: number) {
  return within(hero).getByRole('button', { name: `Slide ${String(n)} de 3` })
}

describe('HeroCarousel', { timeout: APP_TEST_TIMEOUT }, () => {
  it('renders one slide per featured NFT from the API, capped at three', async () => {
    const { queryClient } = renderApp()
    const hero = await readyHero()

    expect(hero).toHaveAttribute('aria-roledescription', 'carousel')
    expect(hero).toHaveAttribute('aria-busy', 'false')
    // The fixture has five featured NFTs; the hero shows three (three dots).
    expect(slides(hero)).toHaveLength(3)
    expect(within(hero).getAllByRole('button', { name: /^Slide \d de 3$/ })).toHaveLength(3)
    expect(queryClient.getQueryData(queryKeys.catalog.featured())).toMatchObject({ items: expect.any(Array) })

    const first = visibleSlide(hero)
    expect(first).toHaveAccessibleName('1 de 3: Emerald Ape #042')
    const link = within(first).getByRole('link')
    expect(link).toHaveAttribute('href', '/nft/emerald-ape-042')
    const img = within(first).getByRole('img')
    expect(img).toHaveAttribute('src', '/nfts/emerald-ape.webp')
    expect(img).toHaveAttribute('loading', 'eager')
    expect(img).toHaveAttribute('width')
    expect(img).toHaveAttribute('height')
    expect(dot(hero, 1)).toHaveAttribute('aria-current', 'true')
    expect(dot(hero, 2)).not.toHaveAttribute('aria-current')

    // Single visible page heading: the hero headline.
    const headings = screen.getAllByRole('heading', { level: 1 })
    expect(headings).toHaveLength(1)
    expect(headings[0]).toHaveTextContent(/SEJA DONO DO FUTURO DA ARTE DIGITAL/)
    expect(within(hero).getByRole('link', { name: /EXPLORAR/ })).toHaveAttribute('href', '#catalogo')
  })

  it('changes slide with the dots', async () => {
    renderApp()
    const hero = await readyHero()

    fireEvent.click(dot(hero, 3))
    expect(visibleSlide(hero)).toHaveAccessibleName('3 de 3: Emerald Regent #012')
    expect(dot(hero, 3)).toHaveAttribute('aria-current', 'true')
    expect(dot(hero, 1)).not.toHaveAttribute('aria-current')

    fireEvent.click(dot(hero, 2))
    expect(visibleSlide(hero)).toHaveAccessibleName('2 de 3: Sage Nomad #009')
  })

  it('moves with Left/Right keys, wraps around and keeps focus on the dots', async () => {
    renderApp()
    const hero = await readyHero()

    const first = dot(hero, 1)
    first.focus()
    fireEvent.keyDown(first, { key: 'ArrowRight' })
    expect(visibleSlide(hero)).toHaveAccessibleName(/^2 de 3/)
    expect(dot(hero, 2)).toHaveFocus()

    fireEvent.keyDown(dot(hero, 2), { key: 'ArrowRight' })
    fireEvent.keyDown(dot(hero, 3), { key: 'ArrowRight' })
    expect(visibleSlide(hero)).toHaveAccessibleName(/^1 de 3/)
    expect(dot(hero, 1)).toHaveFocus()

    fireEvent.keyDown(dot(hero, 1), { key: 'ArrowLeft' })
    expect(visibleSlide(hero)).toHaveAccessibleName(/^3 de 3/)

    // From the slide link: slide changes, focus is not stolen.
    const link = within(visibleSlide(hero)).getByRole('link')
    link.focus()
    fireEvent.keyDown(link, { key: 'ArrowLeft' })
    expect(visibleSlide(hero)).toHaveAccessibleName(/^2 de 3/)
    expect(link).toHaveFocus()

    // Other keys are ignored.
    fireEvent.keyDown(dot(hero, 2), { key: 'ArrowDown' })
    expect(visibleSlide(hero)).toHaveAccessibleName(/^2 de 3/)
  })

  it('shows a shimmer skeleton in the art box while loading', async () => {
    setScenario('slow')
    renderApp()
    const hero = await screen.findByTestId('home-hero', {}, { timeout: APP_READY_TIMEOUT })
    expect(hero).toHaveAttribute('data-state', 'loading')
    expect(hero).toHaveAttribute('aria-busy', 'true')
    expect(hero).not.toHaveAttribute('aria-roledescription')
    const skeleton = within(hero).getByTestId('hero-skeleton').firstElementChild
    expect(skeleton).toHaveClass('animate-shimmer')
    expect(within(hero).queryByRole('img')).toBeNull()
    expect(within(hero).getByRole('heading', { level: 1 })).toBeInTheDocument()
  })

  it('degrades to copy only on error while the catalog keeps working', async () => {
    setScenario({ ...SCENARIO_PRESETS['server-error'], name: 'featured-error', pathPrefix: '/api/nfts/featured' })
    renderApp()
    const hero = await screen.findByTestId('home-hero', {}, { timeout: APP_READY_TIMEOUT })
    await waitFor(() => expect(hero).toHaveAttribute('data-state', 'error'), { timeout: APP_READY_TIMEOUT })

    expect(hero).not.toHaveAttribute('aria-roledescription')
    expect(within(hero).queryByRole('img')).toBeNull()
    expect(within(hero).queryByRole('button')).toBeNull()
    expect(within(hero).getByRole('heading', { level: 1 })).toBeInTheDocument()
    expect(within(hero).getByRole('link', { name: /EXPLORAR/ })).toBeInTheDocument()
    expect(screen.queryByTestId('featured-nft')).toBeNull()
    expect(await screen.findByRole('list', { name: 'NFTs' }, { timeout: APP_READY_TIMEOUT })).toBeInTheDocument()
  })

  it('renders copy only for an empty featured list', async () => {
    server.use(http.get(apiPath('/nfts/featured'), () => HttpResponse.json({ items: [] })))
    renderApp()
    const hero = await screen.findByTestId('home-hero', {}, { timeout: APP_READY_TIMEOUT })
    await waitFor(() => expect(hero).toHaveAttribute('data-state', 'empty'), { timeout: APP_READY_TIMEOUT })
    expect(within(hero).queryByRole('img')).toBeNull()
    expect(within(hero).queryByRole('button')).toBeNull()
    expect(screen.queryByTestId('featured-nft')).toBeNull()
  })

  it('hides the dots and the secondary art for a single featured NFT', async () => {
    server.use(
      http.get(apiPath('/nfts/featured'), () => HttpResponse.json({ items: featuredNfts(getDb().nfts).slice(0, 1) })),
    )
    renderApp()
    const hero = await readyHero()
    expect(slides(hero)).toHaveLength(1)
    expect(within(hero).queryByRole('button')).toBeNull()
    expect(within(hero).queryByTestId('hero-secondary-art')).toBeNull()
    // Arrow keys are a no-op with one slide.
    const link = within(visibleSlide(hero)).getByRole('link')
    fireEvent.keyDown(link, { key: 'ArrowRight' })
    expect(visibleSlide(hero)).toHaveAccessibleName('1 de 1: Emerald Ape #042')
  })
})
