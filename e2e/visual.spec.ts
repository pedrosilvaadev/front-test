import type { Page } from '@playwright/test'
import { expect, gotoReady, pageFetch, test } from './fixtures'

/**
 * P6-01 visual regression (README §9): home, NFT detail, cart and checkout on
 * Chromium desktop (1440×900) and mobile (Pixel 7). Data comes from the
 * default mock seed (reset per test), animations are disabled and fonts/images
 * are awaited, so the screenshots are stable. Baselines are versioned in
 * `e2e/__screenshots__/` (per project and platform); refresh them with
 * `npm run e2e:update-snapshots` after an intended visual change.
 */

const READY = { timeout: 20_000 }
const COLLECTOR = { email: 'colecionador@kurio.test', password: 'Colecionador2026' }

const json = (body: unknown, headers: Record<string, string> = {}): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...headers },
  body: JSON.stringify(body),
})

/** Waits for web fonts and every image in the document (lazy ones are forced to load). */
async function settle(page: Page): Promise<void> {
  await page.evaluate(async () => {
    for (const image of Array.from(document.images)) image.loading = 'eager'
    await document.fonts.ready
    await Promise.all(
      Array.from(document.images).map((image) =>
        image.complete
          ? Promise.resolve()
          : new Promise((resolve) => {
              image.addEventListener('load', resolve, { once: true })
              image.addEventListener('error', resolve, { once: true })
            }),
      ),
    )
  })
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, READY)
}

async function signInWithCart(page: Page): Promise<void> {
  const login = await pageFetch(page, '/api/auth/login', json(COLLECTOR))
  const { session } = JSON.parse(login.body) as { session: { token: string; expiresAt: string; user: { id: string } } }
  await page.evaluate(
    (value) => window.localStorage.setItem('kurio.session', value),
    JSON.stringify({ token: session.token, userId: session.user.id, expiresAt: session.expiresAt }),
  )
  const added = await pageFetch(
    page,
    '/api/cart/items',
    json({ nftId: 'nft_001', editionId: 'nft_001-1of50', quantity: 2 }, { Authorization: `Bearer ${session.token}` }),
  )
  expect(added.status, added.body).toBe(200)
}

test.describe('visual regression', () => {
  test('home', async ({ page }) => {
    await gotoReady(page, '/')
    await expect(page.getByTestId('nft-card').first()).toBeVisible(READY)
    await settle(page)
    await expect(page).toHaveScreenshot('home.png', { fullPage: true })
  })

  test('nft detail', async ({ page }) => {
    await gotoReady(page, '/nft/emerald-ape-042')
    await expect(page.getByRole('heading', { level: 1, name: 'Emerald Ape #042' })).toBeVisible(READY)
    await expect(page.getByTestId('nft-card').first()).toBeVisible(READY)
    await settle(page)
    await expect(page).toHaveScreenshot('nft-detail.png', { fullPage: true })
  })

  test('cart', async ({ page }) => {
    await signInWithCart(page)
    await gotoReady(page, '/carrinho')
    await expect(page.getByTestId('cart-total')).toHaveText('2.396 ETH', READY)
    await settle(page)
    await expect(page).toHaveScreenshot('cart.png', { fullPage: true })
  })

  test('checkout', async ({ page }) => {
    await signInWithCart(page)
    await gotoReady(page, '/checkout')
    await expect(page.getByTestId('checkout-total')).toHaveText('2.396 ETH', READY)
    await settle(page)
    await expect(page).toHaveScreenshot('checkout.png', { fullPage: true })
  })
})
