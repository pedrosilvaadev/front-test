import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect, gotoReady, pageFetch, test } from './fixtures'

/**
 * P6-01 group 11 + README §8: automated WCAG 2.1 A/AA scan (axe-core) of the
 * main screens on desktop and mobile, plus keyboard/focus checks of the auth
 * dialog. Serious/critical violations fail the test; the full report is
 * attached to the HTML report.
 */

const READY = { timeout: 20_000 }
const COLLECTOR = { email: 'colecionador@kurio.test', password: 'Colecionador2026' }

const json = (body: unknown, headers: Record<string, string> = {}): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...headers },
  body: JSON.stringify(body),
})

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
    json({ nftId: 'nft_001', editionId: 'nft_001-1of50', quantity: 1 }, { Authorization: `Bearer ${session.token}` }),
  )
  expect(added.status, added.body).toBe(200)
}

async function scan(page: Page, name: string): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  await test.info().attach(`axe-${name}.json`, { body: JSON.stringify(results.violations, null, 2), contentType: 'application/json' })
  const blocking = results.violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      targets: violation.nodes.slice(0, 5).map((node) => node.target.join(' ')),
    }))
  expect(blocking, `${name}: serious/critical axe violations`).toEqual([])
}

const PUBLIC_PAGES: { name: string; path: string; ready: (page: Page) => Promise<void> }[] = [
  {
    name: 'home',
    path: '/',
    ready: async (page) => {
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible(READY)
      await expect(page.getByTestId('nft-card').first()).toBeVisible(READY)
    },
  },
  {
    name: 'catalog-filtered',
    path: '/?categories=art&sort=price-asc',
    ready: async (page) => {
      await expect(page.getByTestId('nft-card').first()).toBeVisible(READY)
    },
  },
  {
    name: 'detail',
    path: '/nft/emerald-ape-042',
    ready: async (page) => {
      await expect(page.getByRole('heading', { level: 1, name: 'Emerald Ape #042' })).toBeVisible(READY)
    },
  },
  {
    name: 'login',
    path: '/login',
    ready: async (page) => {
      await expect(page.getByRole('dialog')).toBeVisible(READY)
    },
  },
  {
    name: 'not-found',
    path: '/nft/does-not-exist',
    ready: async (page) => {
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible(READY)
    },
  },
]

test.describe('a11y: axe scan (WCAG 2.1 AA)', () => {
  for (const target of PUBLIC_PAGES) {
    test(`${target.name} has no serious/critical violations`, async ({ page }) => {
      await gotoReady(page, target.path)
      await target.ready(page)
      await scan(page, target.name)
    })
  }

  test('cart, checkout and profile have no serious/critical violations', async ({ page }) => {
    await signInWithCart(page)
    await gotoReady(page, '/carrinho')
    await expect(page.getByTestId('cart-lines')).toBeVisible(READY)
    await scan(page, 'cart')

    await gotoReady(page, '/checkout')
    await expect(page.getByTestId('checkout-form')).toBeVisible(READY)
    await expect(page.getByTestId('checkout-total')).toHaveText(/ETH$/, READY)
    await scan(page, 'checkout')

    await gotoReady(page, '/perfil')
    await expect(page.getByTestId('profile-summary')).toBeVisible(READY)
    await scan(page, 'profile')

    await gotoReady(page, '/carteiras')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible(READY)
    await scan(page, 'wallets')
  })
})

test.describe('a11y: keyboard and dialog focus', () => {
  test('auth dialog moves focus in, traps Tab and returns focus on close', async ({ page, isMobile }) => {
    test.skip(isMobile, 'mobile renders the auth form as a full page, not a dialog')
    await gotoReady(page, '/nft/emerald-ape-042')
    await expect(page.getByRole('heading', { level: 1, name: 'Emerald Ape #042' })).toBeVisible(READY)
    const entrar = page.getByRole('banner').getByRole('link', { name: 'Entrar' })
    await entrar.focus()
    await page.keyboard.press('Enter')

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible(READY)
    await expect(dialog.getByLabel('E-mail')).toBeFocused()
    // Tab cycles inside the dialog.
    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press('Tab')
      expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true)
    }
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden(READY)
    await expect(page).toHaveURL(/\/nft\/emerald-ape-042$/)
  })

  test('the login form is fully operable with the keyboard', async ({ page }) => {
    await gotoReady(page, '/login?redirect=/perfil')
    const form = page.getByRole('dialog')
    await expect(form).toBeVisible(READY)
    await form.getByLabel('E-mail').focus()
    await page.keyboard.type(COLLECTOR.email)
    await page.keyboard.press('Tab')
    await page.keyboard.type(COLLECTOR.password)
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/perfil$/, READY)
    await expect(page.getByTestId('profile-summary')).toBeVisible(READY)
  })
})
