import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { renderApp } from '@/test/render-app'
import { APP_READY_TIMEOUT, APP_TEST_TIMEOUT } from '@/test/timeouts'

/**
 * P2-03 fix loop 1: the hero EXPLORAR link and the promo "Explorar" links only
 * scroll/focus the catalog on a plain primary click (isPlainClick guard);
 * Ctrl/Meta/Shift/Alt and middle clicks keep the browser behaviour (new
 * tab/window) and must leave the current page untouched. Arrow keys only move
 * the carousel from a dot or a slide, never from EXPLORAR.
 */

const MODIFIED_CLICKS: ReadonlyArray<[string, MouseEventInit]> = [
  ['Ctrl', { ctrlKey: true }],
  ['Meta', { metaKey: true }],
  ['Shift', { shiftKey: true }],
  ['Alt', { altKey: true }],
  ['middle button', { button: 1 }],
]

/**
 * jsdom cannot open new tabs and logs "navigation not implemented" when an
 * anchor's default action runs, so the default is cancelled on `window`,
 * i.e. after React's root listener has already run the component handler
 * (which therefore still sees `defaultPrevented === false`).
 */
function cancelDefaultAfterReact(event: Event) {
  event.preventDefault()
}

let scrollSpy: MockInstance<Element['scrollIntoView']>

beforeEach(() => {
  scrollSpy = vi.spyOn(Element.prototype, 'scrollIntoView')
  scrollSpy.mockClear()
  window.addEventListener('click', cancelDefaultAfterReact)
})

afterEach(() => {
  window.removeEventListener('click', cancelDefaultAfterReact)
  scrollSpy.mockRestore()
})

async function readyHero() {
  const hero = await screen.findByTestId('home-hero', {}, { timeout: APP_READY_TIMEOUT })
  await waitFor(() => expect(hero).toHaveAttribute('data-state', 'ready'), { timeout: APP_READY_TIMEOUT })
  return hero
}

function catalogScrolls() {
  return scrollSpy.mock.contexts.filter((el) => el instanceof Element && el.id === 'catalogo').length
}

describe('home links: plain-click guard', { timeout: APP_TEST_TIMEOUT }, () => {
  it.each(MODIFIED_CLICKS)('EXPLORAR with %s does not scroll or focus the catalog', async (_name, init) => {
    renderApp()
    const hero = await readyHero()
    const explore = within(hero).getByRole('link', { name: /EXPLORAR/ })
    explore.focus()

    // `fireEvent` returns false only when a handler (React or ours) cancelled the event;
    // our window listener always does, so check the handler through its side effects.
    fireEvent.click(explore, init)
    expect(document.getElementById('catalogo')).not.toHaveFocus()
    expect(explore).toHaveFocus()
    expect(catalogScrolls()).toBe(0)
  })

  it('EXPLORAR with a plain click prevents the hash jump, scrolls and focuses the catalog', async () => {
    renderApp()
    const hero = await readyHero()
    const explore = within(hero).getByRole('link', { name: /EXPLORAR/ })
    window.removeEventListener('click', cancelDefaultAfterReact)
    const notCancelled = fireEvent.click(explore)
    expect(notCancelled).toBe(false)
    expect(document.getElementById('catalogo')).toHaveFocus()
    expect(catalogScrolls()).toBe(1)
  })

  it.each(MODIFIED_CLICKS)('promo "Explorar" with %s keeps the URL and does not move to the catalog', async (_name, init) => {
    const { router } = renderApp()
    await readyHero()
    const promos = await screen.findByTestId('promo-banners', {}, { timeout: APP_READY_TIMEOUT })
    const digital = within(promos).getByRole('link', { name: /Explorar\s*Arte digital selecionada/ })
    digital.focus()

    fireEvent.click(digital, init)
    // Give a (wrong) client navigation the chance to happen before asserting it did not.
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(router.state.location.search).toEqual({})
    expect(document.getElementById('catalogo')).not.toHaveFocus()
    expect(digital).toHaveFocus()
    expect(catalogScrolls()).toBe(0)
  })

  it('promo "Explorar" with a plain click writes the filter and moves to the catalog', async () => {
    const { router } = renderApp()
    await readyHero()
    const promos = await screen.findByTestId('promo-banners', {}, { timeout: APP_READY_TIMEOUT })
    fireEvent.click(within(promos).getByRole('link', { name: /Explorar\s*Arte digital selecionada/ }))
    await waitFor(() => expect(router.state.location.search).toEqual({ categories: 'digital-art' }), {
      timeout: APP_READY_TIMEOUT,
    })
    expect(document.getElementById('catalogo')).toHaveFocus()
    expect(catalogScrolls()).toBe(1)
  })
})

describe('hero arrow keys scope', { timeout: APP_TEST_TIMEOUT }, () => {
  function activeSlideLabel(hero: HTMLElement) {
    const visible = within(hero)
      .getAllByRole('group', { hidden: true })
      .filter((el) => el.getAttribute('aria-roledescription') === 'slide' && !el.hidden)
    expect(visible).toHaveLength(1)
    return visible[0]!.getAttribute('aria-label')
  }

  it('ignores Left/Right while focus is on EXPLORAR and does not cancel the key', async () => {
    renderApp()
    const hero = await readyHero()
    const explore = within(hero).getByRole('link', { name: /EXPLORAR/ })
    explore.focus()
    expect(activeSlideLabel(hero)).toMatch(/^1 de 3/)

    expect(fireEvent.keyDown(explore, { key: 'ArrowRight' })).toBe(true)
    expect(activeSlideLabel(hero)).toMatch(/^1 de 3/)
    expect(fireEvent.keyDown(explore, { key: 'ArrowLeft' })).toBe(true)
    expect(activeSlideLabel(hero)).toMatch(/^1 de 3/)
    expect(explore).toHaveFocus()
  })

  it('moves from a dot and from the slide itself (keys are consumed there)', async () => {
    renderApp()
    const hero = await readyHero()
    const dot = within(hero).getByRole('button', { name: 'Slide 1 de 3' })
    dot.focus()
    expect(fireEvent.keyDown(dot, { key: 'ArrowRight' })).toBe(false)
    expect(activeSlideLabel(hero)).toMatch(/^2 de 3/)

    const slide = within(hero)
      .getAllByRole('group', { hidden: true })
      .find((el) => el.getAttribute('aria-roledescription') === 'slide' && !el.hidden)!
    expect(fireEvent.keyDown(slide, { key: 'ArrowLeft' })).toBe(false)
    expect(activeSlideLabel(hero)).toMatch(/^1 de 3/)
  })
})
