import type { Page } from '@playwright/test'
import { expect, gotoReady, pageFetch, test } from './fixtures'

/**
 * P2-04 NFT detail (`/nft/$idOrSlug`): client navigation from the catalog,
 * direct load/refresh, 404 for unknown NFTs, server error + retry, gallery
 * and zoom dialog, related NFTs navigation and layout (no overflow, mobile
 * sticky bar). Runs on desktop and mobile projects.
 */

const SLUG = 'emerald-ape-042'
const NAME = 'Emerald Ape #042'
const READY = { timeout: 15_000 }

interface RelatedItem {
  slug: string
  name: string
}

async function apiRelated(page: Page, idOrSlug: string): Promise<RelatedItem[]> {
  const result = await pageFetch(page, `/api/nfts/${idOrSlug}/related`)
  expect(result.status, 'GET related').toBe(200)
  return (JSON.parse(result.body) as { items: RelatedItem[] }).items
}

async function setScenario(page: Page, name: string): Promise<void> {
  const result = await pageFetch(page, '/api/__dev/scenario', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  expect(result.status, `PUT scenario ${name}`).toBe(200)
}

async function expectDetail(page: Page, name: string): Promise<void> {
  await expect(page.getByTestId('nft-detail')).toBeVisible(READY)
  const h1 = page.getByRole('heading', { level: 1 })
  await expect(h1).toHaveCount(1)
  await expect(h1).toHaveText(name)
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow, 'horizontal overflow (px)').toBeLessThanOrEqual(0)
}

test.describe('nft detail: navigation', () => {
  test('catalog card opens the detail with client-side navigation', async ({ page }) => {
    const card = page.getByRole('list', { name: 'NFTs' }).getByTestId('nft-card').first()
    await expect(card).toBeVisible(READY)
    const link = card.getByRole('heading').getByRole('link')
    const name = (await link.textContent()) ?? ''
    const href = await link.getAttribute('href')
    expect(href).toMatch(/^\/nft\/[a-z0-9-]+$/)

    // A full page load would drop this marker.
    await page.evaluate(() => {
      ;(window as unknown as { __spaMarker: boolean }).__spaMarker = true
    })
    await link.click()
    await expect(page).toHaveURL(new RegExp(`${href ?? ''}$`))
    await expectDetail(page, name)
    expect(await page.evaluate(() => (window as unknown as { __spaMarker?: boolean }).__spaMarker)).toBe(true)
    await expect(page).toHaveTitle(`${name} | Kurio`)
  })

  test('direct load and refresh work by slug and by id', async ({ page }) => {
    await gotoReady(page, `/nft/${SLUG}`)
    await expectDetail(page, NAME)
    await page.reload()
    await expectDetail(page, NAME)
    await expect(page).toHaveTitle(`${NAME} | Kurio`)

    await gotoReady(page, '/nft/nft_001')
    await expectDetail(page, NAME)
  })

  test('unknown NFT renders the 404 state inside the shell', async ({ page }) => {
    await gotoReady(page, '/nft/nao-existe-999')
    const heading = page.getByRole('heading', { level: 1, name: 'NFT não encontrado' })
    await expect(heading).toBeVisible(READY)
    await expect(page.getByTestId('nft-not-found')).toContainText('404')
    await expect(page.getByRole('contentinfo')).toBeAttached()
    await expect(page.getByRole('alert')).toHaveCount(0)

    await page.getByRole('link', { name: 'Voltar ao catálogo' }).click()
    await expect(page).toHaveURL(/\/#catalogo$/)
    await expect(page.getByRole('list', { name: 'NFTs' }).getByTestId('nft-card').first()).toBeVisible(READY)
  })

  test('server error shows a retry that recovers', async ({ page }) => {
    await gotoReady(page, `/nft/${SLUG}?scenario=server-error`)
    const alert = page.getByRole('alert').filter({ hasText: 'Não foi possível carregar o NFT' })
    await expect(alert).toBeVisible(READY)
    await expect(page.getByText('NFT não encontrado')).toHaveCount(0)

    await setScenario(page, 'default')
    await alert.getByRole('button', { name: 'Tentar novamente' }).click()
    await expectDetail(page, NAME)
    await expect(alert).toHaveCount(0)
  })

  test('related NFT link navigates client-side, scrolls to top and loads new data', async ({ page }) => {
    await gotoReady(page, `/nft/${SLUG}`)
    await expectDetail(page, NAME)
    const related = await apiRelated(page, SLUG)
    const first = related[0]
    if (!first) throw new Error('expected related NFTs')

    const list = page.getByRole('list', { name: 'NFTs relacionados' })
    await list.scrollIntoViewIfNeeded()
    await expect(list.getByRole('link')).toHaveCount(related.length)
    await list.getByRole('link', { name: first.name }).click()

    await expect(page).toHaveURL(new RegExp(`/nft/${first.slug}$`))
    await expectDetail(page, first.name)
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(5)
    await expect(page).toHaveTitle(`${first.name} | Kurio`)
  })
})

test.describe('nft detail: purchase controls', () => {
  test('editions and stepper bounds; buy adds the selection to the cart', async ({ page, isMobile }) => {
    await gotoReady(page, `/nft/${SLUG}`)
    await expectDetail(page, NAME)
    const group = page.getByRole('radiogroup', { name: 'Edição:' })
    await expect(group.getByRole('radio', { name: '1/1', exact: true })).toBeChecked()

    const scope = isMobile ? page.getByTestId('mobile-buy-bar') : page.getByTestId('desktop-purchase')
    await expect(scope).toBeVisible()
    const plus = scope.getByRole('button', { name: 'Aumentar quantidade' })
    const value = scope.getByRole('status')
    await expect(plus).toBeDisabled()

    // Keyboard: arrows move within the radiogroup (Radix roving focus selects on focus).
    await group.getByRole('radio', { name: '1/1', exact: true }).focus()
    // Radix moves focus in a timeout and selects only while the arrow is still down (as with a real key press).
    await page.keyboard.down('ArrowRight')
    await expect(group.getByRole('radio', { name: '1/10', exact: true })).toBeFocused()
    await page.keyboard.up('ArrowRight')
    await expect(group.getByRole('radio', { name: '1/10', exact: true })).toBeChecked()
    await group.getByRole('radio', { name: '1/50', exact: true }).click()
    for (let i = 0; i < 6; i += 1) {
      if (await plus.isEnabled()) await plus.click()
    }
    await expect(value).toHaveText('5')
    await expect(plus).toBeDisabled()
    await group.getByRole('radio', { name: '1/10', exact: true }).click()
    await expect(value).toHaveText('2')

    // P4-01: the buy action adds the selection (1/10 × 2) and opens the cart.
    await scope.getByRole('button', { name: isMobile ? 'Comprar NFT' : 'COMPRAR', exact: true }).click()
    await expect(page).toHaveURL(/\/carrinho$/, READY)
    await expect(page.getByTestId('cart-line')).toHaveCount(1, READY)
    await expect(page.getByTestId('cart-line-quantity')).toHaveText('2')
    await expect(page.getByTestId('cart-line-edition').filter({ visible: true })).toHaveText('Edição: 1/10')
  })

  test('mobile: sticky bar stays in view and back returns to the previous page', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile layout only')
    const card = page.getByRole('list', { name: 'NFTs' }).getByTestId('nft-card').first()
    await expect(card).toBeVisible(READY)
    await card.getByRole('heading').getByRole('link').click()
    await expect(page.getByTestId('nft-detail')).toBeVisible(READY)

    const bar = page.getByTestId('mobile-buy-bar')
    await expect(bar).toBeInViewport()
    await page.getByTestId('nft-detail-tabs').scrollIntoViewIfNeeded()
    await expect(bar).toBeInViewport()
    await expect(page.getByTestId('nft-favorite-mobile')).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByRole('button', { name: 'Ampliar imagem' })).toBeHidden()

    await page.evaluate(() => window.scrollTo(0, 0))
    await page.getByRole('button', { name: 'Voltar' }).click()
    await expect(page).toHaveURL(/\/$/)
  })

  test('mobile: back falls back to home when opened directly', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile layout only')
    await page.goto('about:blank')
    await gotoReady(page, `/nft/${SLUG}`)
    await expectDetail(page, NAME)
    await page.getByRole('button', { name: 'Voltar' }).click()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('list', { name: 'NFTs' })).toBeVisible(READY)
  })
})

test.describe('nft detail: gallery', () => {
  test('thumbnails switch the image and zoom opens a dialog (Esc closes, focus returns)', async ({ page, isMobile }) => {
    test.skip(isMobile, 'thumbnails and zoom are desktop affordances (Figma mobile has neither)')
    await gotoReady(page, `/nft/${SLUG}`)
    await expectDetail(page, NAME)
    const thumbs = page.getByRole('list', { name: 'Imagens do NFT' }).getByRole('button')
    await expect(thumbs).toHaveCount(4)
    await thumbs.nth(1).click()
    await expect(thumbs.nth(1)).toHaveAttribute('aria-pressed', 'true')
    await expect(thumbs.nth(0)).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByTestId('nft-main-image')).toHaveAttribute('alt', `${NAME}, vista 2 de 4`)

    const zoom = page.getByRole('button', { name: 'Ampliar imagem' })
    await zoom.click()
    const dialog = page.getByRole('dialog', { name: NAME })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('img')).toHaveAttribute('alt', `${NAME}, vista 2 de 4`)
    // Focus is trapped inside the dialog.
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true)
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(zoom).toBeFocused()
  })
})

test.describe('nft detail: layout', () => {
  for (const width of [390, 768, 1440]) {
    test(`no horizontal overflow at ${String(width)}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await gotoReady(page, `/nft/${SLUG}`)
      await expectDetail(page, NAME)
      await page.getByRole('list', { name: 'NFTs relacionados' }).scrollIntoViewIfNeeded()
      await expectNoHorizontalOverflow(page)
    })
  }

  test('loading shows the skeleton', async ({ page }) => {
    await gotoReady(page, `/nft/${SLUG}?scenario=slow`)
    await expect(page.getByTestId('nft-detail-skeleton')).toBeVisible()
    await expectDetail(page, NAME)
    await expect(page.getByTestId('nft-detail-skeleton')).toHaveCount(0)
    await setScenario(page, 'default')
  })
})
