import type { Locator, Page } from '@playwright/test'
import { expect, gotoReady, pageFetch, test } from './fixtures'

/**
 * P2-03 home: hero carousel fed by GET /api/nfts/featured, "NFT em destaque"
 * card (desktop), promo banners linking to catalog filters and the
 * "Diário da Cunhagem" editorial block. Runs on desktop and mobile projects.
 */

interface FeaturedItem {
  slug: string
  name: string
  image: { url: string }
}

async function apiFeatured(page: Page): Promise<FeaturedItem[]> {
  const result = await pageFetch(page, '/api/nfts/featured')
  expect(result.status, 'GET /api/nfts/featured').toBe(200)
  return (JSON.parse(result.body) as { items: FeaturedItem[] }).items
}

async function setScenario(page: Page, name: string): Promise<void> {
  const result = await pageFetch(page, '/api/__dev/scenario', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  expect(result.status, `PUT scenario ${name}`).toBe(200)
}

function hero(page: Page): Locator {
  return page.getByTestId('home-hero')
}

function visibleSlide(page: Page): Locator {
  return hero(page).locator('[aria-roledescription="slide"]:not([hidden])')
}

async function readyHero(page: Page): Promise<Locator> {
  await expect(hero(page)).toHaveAttribute('data-state', 'ready', { timeout: 15_000 })
  return hero(page)
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow, 'horizontal overflow (px)').toBeLessThanOrEqual(0)
}

function nth<T>(items: readonly T[], index: number): T {
  const item = items[index]
  if (item === undefined) throw new Error(`missing featured item ${String(index)}`)
  return item
}

test.describe('home hero', () => {
  test('renders the featured NFTs from the API with a single visible h1', async ({ page, isMobile }) => {
    const featured = (await apiFeatured(page)).slice(0, 3)
    expect(featured).toHaveLength(3)
    const first = nth(featured, 0)
    const root = await readyHero(page)

    await expect(root).toHaveAttribute('aria-roledescription', 'carousel')
    await expect(root.locator('[aria-roledescription="slide"]')).toHaveCount(3)
    await expect(visibleSlide(page)).toHaveAttribute('aria-label', `1 de 3: ${first.name}`)
    const art = visibleSlide(page).getByRole('img')
    await expect(art).toBeVisible()
    await expect(art).toHaveAttribute('src', first.image.url)
    await expect
      .poll(() => art.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0))
      .toBe(true)
    await expect(visibleSlide(page).getByRole('link')).toHaveAttribute('href', `/nft/${first.slug}`)

    const h1 = page.getByRole('heading', { level: 1 })
    await expect(h1).toHaveCount(1)
    await expect(h1).toBeVisible()
    // Only the breakpoint's wording is rendered (the other span is display:none).
    await expect(h1).toHaveAccessibleName(isMobile ? 'SEJA DONO DA CULTURA DIGITAL' : 'SEJA DONO DO FUTURO DA ARTE DIGITAL')
  })

  test('dots and arrow keys change the slide', async ({ page }) => {
    const featured = (await apiFeatured(page)).slice(0, 3)
    const root = await readyHero(page)
    const dot = (n: number) => root.getByRole('button', { name: `Slide ${String(n)} de 3` })

    await expect(dot(1)).toHaveAttribute('aria-current', 'true')
    await dot(2).click()
    await expect(visibleSlide(page)).toHaveAttribute('aria-label', `2 de 3: ${nth(featured, 1).name}`)
    await expect(dot(2)).toHaveAttribute('aria-current', 'true')
    await expect(dot(1)).not.toHaveAttribute('aria-current', 'true')
    await expect(visibleSlide(page).getByRole('img')).toHaveAttribute('src', nth(featured, 1).image.url)

    await dot(2).focus()
    await page.keyboard.press('ArrowRight')
    await expect(visibleSlide(page)).toHaveAttribute('aria-label', `3 de 3: ${nth(featured, 2).name}`)
    await expect(dot(3)).toBeFocused()
    await page.keyboard.press('ArrowRight')
    await expect(visibleSlide(page)).toHaveAttribute('aria-label', /^1 de 3/)
    await page.keyboard.press('ArrowLeft')
    await expect(visibleSlide(page)).toHaveAttribute('aria-label', /^3 de 3/)
  })

  test('EXPLORAR takes keyboard users to the catalog', async ({ page }) => {
    await readyHero(page)
    const explore = hero(page).getByRole('link', { name: /EXPLORAR/ })
    await expect(explore).toHaveAttribute('href', '#catalogo')
    await explore.focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('#catalogo')).toBeFocused()
    await expect(page.getByRole('tab', { name: 'Todos os NFTs' })).toBeInViewport()
  })

  test('server error degrades the hero to copy only and the catalog stays usable', async ({ page }) => {
    await gotoReady(page, '/?scenario=server-error')
    await expect(hero(page)).toHaveAttribute('data-state', 'error', { timeout: 15_000 })
    await expect(hero(page).getByRole('img')).toHaveCount(0)
    await expect(hero(page).getByRole('button')).toHaveCount(0)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(hero(page).getByRole('link', { name: /EXPLORAR/ })).toBeVisible()
    await expect(page.getByTestId('featured-nft')).toHaveCount(0)

    const alert = page.getByRole('alert').filter({ hasText: 'Não foi possível carregar os NFTs' })
    await expect(alert).toBeVisible({ timeout: 15_000 })
    await setScenario(page, 'default')
    await alert.getByRole('button', { name: 'Tentar novamente' }).click()
    await expect(page.getByRole('list', { name: 'NFTs' }).getByTestId('nft-card').first()).toBeVisible({
      timeout: 15_000,
    })
    await expect(alert).toHaveCount(0)
    await expectNoHorizontalOverflow(page)
  })
})

test.describe('home hero: interaction guards', () => {
  test('Left/Right on EXPLORAR do not change the slide', async ({ page }) => {
    const root = await readyHero(page)
    const explore = root.getByRole('link', { name: /EXPLORAR/ })
    await explore.focus()
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowRight')
    await expect(visibleSlide(page)).toHaveAttribute('aria-label', /^1 de 3/)
    await expect(explore).toBeFocused()

    // Control: the same key from a dot does move the carousel.
    await root.getByRole('button', { name: 'Slide 1 de 3' }).focus()
    await page.keyboard.press('ArrowRight')
    await expect(visibleSlide(page)).toHaveAttribute('aria-label', /^2 de 3/)
  })

  test('Ctrl/Meta-click on EXPLORAR and promo links leaves the page and focus untouched', async ({ page, context }) => {
    await readyHero(page)
    const popups: Page[] = []
    context.on('page', (opened) => popups.push(opened))
    const catalog = page.locator('#catalogo')

    await hero(page).getByRole('link', { name: /EXPLORAR/ }).click({ modifiers: ['ControlOrMeta'] })
    await expect(catalog).not.toBeFocused()
    expect(new URL(page.url()).hash).toBe('')

    const promo = page.getByTestId('promo-banners').getByRole('link', { name: /Explorar\s+Arte digital selecionada/ })
    await promo.click({ modifiers: ['ControlOrMeta'] })
    await expect(catalog).not.toBeFocused()
    expect(new URL(page.url()).search).toBe('')
    for (const opened of popups) await opened.close()
  })

  test('server error at 390px keeps the hero height of the loading state (no CLS)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const measure = async () => {
      await page.evaluate(() => document.fonts.ready)
      return page.evaluate(() => {
        const heroBox = document.querySelector('[data-testid="home-hero"]')?.getBoundingClientRect()
        const catalogBox = document.getElementById('catalogo')?.getBoundingClientRect()
        if (!heroBox || !catalogBox) throw new Error('missing hero or catalog')
        return { heroHeight: heroBox.height, catalogTop: catalogBox.top + window.scrollY }
      })
    }

    // Loading: `timeout` holds the featured request open (client timeout 10s), so the skeleton stays put.
    await gotoReady(page, '/?scenario=timeout')
    await expect(hero(page)).toHaveAttribute('data-state', 'loading')
    await expect(page.getByTestId('hero-skeleton')).toBeVisible()
    const loading = await measure()

    await gotoReady(page, '/?scenario=server-error')
    await expect(hero(page)).toHaveAttribute('data-state', 'error', { timeout: 15_000 })
    await expect(page.getByTestId('hero-art-spacer')).toHaveCount(1)
    await expect(page.getByTestId('hero-skeleton')).toHaveCount(0)
    const error = await measure()

    expect(Math.abs(error.heroHeight - loading.heroHeight), 'hero height loading vs error (px)').toBeLessThanOrEqual(1)
    expect(Math.abs(error.catalogTop - loading.catalogTop), 'catalog top loading vs error (px)').toBeLessThanOrEqual(1)
    await setScenario(page, 'default')
  })
})

test.describe('home featured card', () => {
  test('desktop shows "NFT em destaque" under the filters; mobile hides it', async ({ page, isMobile }) => {
    const featured = await apiFeatured(page)
    await readyHero(page)
    const card = page.getByTestId('featured-nft')
    if (isMobile) {
      await expect(card).toBeHidden()
      return
    }
    await expect(card).toBeVisible()
    await expect(card.getByRole('heading', { name: 'NFT em destaque' })).toBeVisible()
    await expect(card.getByRole('link')).toHaveAttribute('href', `/nft/${nth(featured, 1).slug}`)
    const filtersBox = await page.getByRole('complementary', { name: 'Filtros' }).boundingBox()
    const cardBox = await card.boundingBox()
    if (!filtersBox || !cardBox) throw new Error('missing layout boxes')
    expect(cardBox.y).toBeGreaterThan(filtersBox.y + filtersBox.height)
    expect(Math.abs(cardBox.x - filtersBox.x)).toBeLessThan(2)
  })
})

test.describe('home promos and editorial', () => {
  test('promo banners set catalog URL filters', async ({ page }) => {
    await readyHero(page)
    const promos = page.getByTestId('promo-banners')

    await promos.getByRole('link', { name: /Explorar\s+Lançamentos gênesis/ }).click()
    await expect(page).toHaveURL(/\/\?tab=new$/)
    await expect(page.getByRole('tab', { name: 'Novos lançamentos' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('#catalogo')).toBeFocused()

    await promos.getByRole('link', { name: /Explorar\s+Arte digital selecionada/ }).click()
    await expect(page).toHaveURL(/\/\?categories=digital-art$/)
    const result = await pageFetch(page, '/api/nfts?categories=digital-art')
    const total = (JSON.parse(result.body) as { page: { totalItems: number } }).page.totalItems
    await expect(page.getByTestId('catalog-status')).toHaveText(new RegExp(`^${String(total)} NFTs`), {
      timeout: 15_000,
    })
  })

  test('"Diário da Cunhagem" lists four articles with unavailable links', async ({ page }) => {
    const journal = page.getByTestId('mint-journal')
    await journal.scrollIntoViewIfNeeded()
    await expect(journal.getByRole('heading', { level: 2, name: 'Diário da Cunhagem' })).toBeVisible()
    await expect(journal.getByRole('article')).toHaveCount(4)
    const more = journal.getByRole('link', { name: /Ler mais/ })
    await expect(more).toHaveCount(4)
    for (const link of await more.all()) await expect(link).toHaveAttribute('aria-disabled', 'true')
    const before = page.url()
    await more.first().click({ force: true })
    expect(page.url()).toBe(before)
  })

  for (const width of [390, 768, 1440]) {
    test(`no horizontal overflow at ${String(width)}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await gotoReady(page, '/')
      await readyHero(page)
      await expect(page.getByTestId('nft-card').first()).toBeVisible({ timeout: 15_000 })
      await page.getByTestId('mint-journal').scrollIntoViewIfNeeded()
      await expectNoHorizontalOverflow(page)
    })
  }
})
