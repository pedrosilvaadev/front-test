import type { Page } from '@playwright/test'
import { expect, gotoReady, pageFetch, test, waitForMockWorker } from './fixtures'

/**
 * P4-01 cart + quote: guest cart persisted server side (mock db) and keyed by
 * `kurio.guestCartId`, merged on login with availability caps (ADR-006),
 * isolated after logout; coupons (KURIO10 10%, LANCAMENTO 0.5 ETH, EXPIRADO
 * expired, anything else invalid); availability conflicts; exact quote
 * totals. Runs on desktop and mobile.
 *
 * Seed (src/mocks/fixtures/nfts.ts): Emerald Ape #042 (nft_001) 1.19 ETH;
 * edition 1/10 has 2 left (max 3 per order), 1/50 has 10 left (max 5).
 */

const READY = { timeout: 15_000 }
const SLUG = 'emerald-ape-042'
const GUEST_KEY = 'kurio.guestCartId'
const GUEST = '55555555-5555-4555-8555-555555555555'
const COLLECTOR = { email: 'colecionador@kurio.test', password: 'Colecionador2026', displayName: 'Kurio Collector' }

const json = (body: unknown, headers: Record<string, string> = {}): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...headers },
  body: JSON.stringify(body),
})

/** Seeds a guest cart through the mock API (same realm as the app) and stores its id. */
async function seedGuestCart(page: Page, lines: { editionId: string; quantity: number }[]): Promise<void> {
  await page.evaluate(([key, id]) => window.localStorage.setItem(key, id), [GUEST_KEY, GUEST] as const)
  for (const line of lines) {
    const result = await pageFetch(page, '/api/cart/items', json({ nftId: 'nft_001', ...line }, { 'X-Guest-Cart-Id': GUEST }))
    expect(result.status, result.body).toBe(200)
  }
}

async function openCart(page: Page): Promise<void> {
  await gotoReady(page, '/carrinho')
  await expect(page.getByTestId('cart-lines').or(page.getByTestId('cart-empty'))).toBeVisible(READY)
}

async function expectTotals(page: Page, totals: { subtotal: string; discount: string; total: string }) {
  await expect(page.getByTestId('cart-subtotal')).toHaveText(totals.subtotal, READY)
  await expect(page.getByTestId('cart-discount')).toHaveText(totals.discount)
  await expect(page.getByTestId('cart-fee')).toHaveText('0.016 ETH')
  await expect(page.getByTestId('cart-total')).toHaveText(totals.total)
}

function cartLink(page: Page, isMobile: boolean) {
  const scope = isMobile ? page.getByRole('navigation', { name: 'Principal' }) : page.getByRole('banner')
  return scope.getByTestId('cart-nav-link')
}

test.describe('cart: guest → login merge → logout', () => {
  test('guest cart persists, merges with a cap on login and is isolated after logout', async ({ page, isMobile }) => {
    // The collector's server cart already holds 1 × 1/10 (2 left).
    const login = await pageFetch(page, '/api/auth/login', json({ email: COLLECTOR.email, password: COLLECTOR.password }))
    const token = (JSON.parse(login.body) as { session: { token: string } }).session.token
    const seeded = await pageFetch(
      page,
      '/api/cart/items',
      json({ nftId: 'nft_001', editionId: 'nft_001-1of10', quantity: 1 }, { Authorization: `Bearer ${token}` }),
    )
    expect(seeded.status).toBe(200)

    // Guest adds 2 × 1/10 from the detail page; the buy action opens the cart.
    await gotoReady(page, `/nft/${SLUG}`)
    await page.getByRole('radiogroup', { name: 'Edição:' }).getByRole('radio', { name: '1/10', exact: true }).click()
    const scope = isMobile ? page.getByTestId('mobile-buy-bar') : page.getByTestId('desktop-purchase')
    await scope.getByRole('button', { name: 'Aumentar quantidade' }).click()
    await expect(scope.getByRole('status')).toHaveText('2')
    await scope.getByRole('button', { name: isMobile ? 'Comprar NFT' : 'COMPRAR', exact: true }).click()

    await expect(page).toHaveURL(/\/carrinho$/, READY)
    await expect(page.getByTestId('cart-line')).toHaveCount(1, READY)
    await expect(page.getByTestId('cart-line-quantity')).toHaveText('2')
    await expectTotals(page, { subtotal: '2.38 ETH', discount: '(-) 0.00 ETH', total: '2.396 ETH' })
    await expect(cartLink(page, isMobile)).toHaveAccessibleName('Carrinho, 2 itens')
    const guestId = await page.evaluate((key) => window.localStorage.getItem(key), GUEST_KEY)
    expect(guestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)

    // Refresh: the guest cart is still there.
    await page.reload()
    await waitForMockWorker(page)
    await expect(page.getByTestId('cart-line-quantity')).toHaveText('2', READY)

    // Login merges: 1 (user) + 2 (guest) capped at 2 available; the adjustment is shown.
    await gotoReady(page, '/login?redirect=/carrinho')
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible(READY)
    await dialog.getByLabel('E-mail').fill(COLLECTOR.email)
    await dialog.getByLabel('Senha', { exact: true }).fill(COLLECTOR.password)
    await dialog.getByRole('button', { name: 'Entrar', exact: true }).click()
    await expect(page).toHaveURL(/\/carrinho$/, READY)
    const notice = page.getByTestId('cart-merge-notice')
    await expect(notice).toBeVisible(READY)
    await expect(notice.getByTestId('cart-merge-adjustments')).toHaveText(
      'Emerald Ape #042 (1/10): 3 → 2 (limitado ao estoque disponível)',
      READY,
    )
    await expect(page.getByTestId('cart-line-quantity')).toHaveText('2')
    await expectTotals(page, { subtotal: '2.38 ETH', discount: '(-) 0.00 ETH', total: '2.396 ETH' })
    expect(await page.evaluate((key) => window.localStorage.getItem(key), GUEST_KEY)).toBeNull()
    await notice.getByRole('button', { name: 'Fechar aviso do carrinho' }).click()
    await expect(notice).toBeHidden()

    // Logout: the user's cart is never shown to the guest.
    await gotoReady(page, '/perfil')
    await page.getByTestId('profile-summary').getByRole('button', { name: 'Sair' }).click()
    await expect(page).toHaveURL(/\/$/, READY)
    await openCart(page)
    await expect(page.getByTestId('cart-empty')).toBeVisible()
    await expect(cartLink(page, isMobile)).toHaveAccessibleName('Carrinho')
  })
})

test.describe('cart page', () => {
  test('coupon: invalid and expired errors, valid percent and fixed discounts with exact totals', async ({ page }) => {
    await seedGuestCart(page, [{ editionId: 'nft_001-1of50', quantity: 3 }])
    await openCart(page)
    await expectTotals(page, { subtotal: '3.57 ETH', discount: '(-) 0.00 ETH', total: '3.586 ETH' })

    const input = page.getByRole('textbox', { name: 'Código promocional' })
    const apply = page.getByRole('button', { name: 'Aplicar' })
    await input.fill('NAOEXISTE')
    await apply.click()
    await expect(page.getByTestId('coupon-error')).toHaveText('Cupom inválido. Confira o código e tente novamente.')
    await expect(input).toHaveAttribute('aria-invalid', 'true')
    await input.fill('expirado')
    await apply.click()
    await expect(page.getByTestId('coupon-error')).toHaveText('Este cupom expirou.')

    await input.fill('kurio10')
    await apply.click()
    await expect(page.getByTestId('applied-coupon')).toContainText('KURIO10')
    await expect(page.getByTestId('coupon-error')).toBeHidden()
    await expectTotals(page, { subtotal: '3.57 ETH', discount: '(-) 0.357 ETH', total: '3.229 ETH' })

    await input.fill('LANCAMENTO')
    await apply.click()
    await expect(page.getByTestId('applied-coupon')).toContainText('LANCAMENTO')
    await expectTotals(page, { subtotal: '3.57 ETH', discount: '(-) 0.50 ETH', total: '3.086 ETH' })

    await page.getByRole('button', { name: 'Remover cupom LANCAMENTO' }).click()
    await expect(page.getByTestId('applied-coupon')).toBeHidden()
    await expectTotals(page, { subtotal: '3.57 ETH', discount: '(-) 0.00 ETH', total: '3.586 ETH' })
  })

  test('quantity update and remove keep quote totals exact; empty state links to the catalog', async ({ page, isMobile }) => {
    await seedGuestCart(page, [
      { editionId: 'nft_001-1of50', quantity: 2 },
      { editionId: 'nft_001-open', quantity: 6 },
    ])
    await openCart(page)
    const lines = page.getByTestId('cart-line')
    await expect(lines).toHaveCount(2)
    await expectTotals(page, { subtotal: '9.52 ETH', discount: '(-) 0.00 ETH', total: '9.536 ETH' })
    await expect(cartLink(page, isMobile)).toHaveAccessibleName('Carrinho, 8 itens')

    const first = lines.first()
    await first.getByRole('button', { name: 'Aumentar quantidade' }).click()
    await expect(first.getByTestId('cart-line-quantity')).toHaveText('3')
    await expectTotals(page, { subtotal: '10.71 ETH', discount: '(-) 0.00 ETH', total: '10.726 ETH' })
    await expect(first.getByTestId('cart-line-total').filter({ visible: true })).toHaveText('3.57 ETH')
    await first.getByRole('button', { name: 'Diminuir quantidade' }).click()
    await expect(first.getByTestId('cart-line-quantity')).toHaveText('2')
    await expectTotals(page, { subtotal: '9.52 ETH', discount: '(-) 0.00 ETH', total: '9.536 ETH' })

    await lines.nth(1).getByRole('button', { name: 'Remover Emerald Ape #042 do carrinho' }).click()
    await expect(lines).toHaveCount(1)
    await expectTotals(page, { subtotal: '2.38 ETH', discount: '(-) 0.00 ETH', total: '2.396 ETH' })
    await lines.first().getByRole('button', { name: 'Remover Emerald Ape #042 do carrinho' }).click()
    const empty = page.getByTestId('cart-empty')
    await expect(empty).toBeVisible()
    await expect(empty.getByRole('link', { name: 'Explorar NFTs' })).toHaveAttribute('href', '/#catalogo')
    await expect(cartLink(page, isMobile)).toHaveAccessibleName('Carrinho')
  })

  test('availability conflict is shown inline with the allowed max; detail add over the limit too', async ({ page, isMobile }) => {
    await seedGuestCart(page, [{ editionId: 'nft_001-1of50', quantity: 2 }])
    await openCart(page)
    await expectTotals(page, { subtotal: '2.38 ETH', discount: '(-) 0.00 ETH', total: '2.396 ETH' })
    // Another buyer leaves only 2 units of 1/50.
    const patched = await pageFetch(page, '/api/__dev/nfts/nft_001', json({ editions: [{ id: 'nft_001-1of50', available: 2 }] }))
    expect(patched.status).toBe(200)

    const line = page.getByTestId('cart-line').first()
    await line.getByRole('button', { name: 'Aumentar quantidade' }).click()
    await expect(line.getByTestId('cart-line-error')).toHaveText(
      'Quantidade indisponível: o máximo permitido para esta edição é 2 unidades.',
    )
    await expect(line.getByTestId('cart-line-quantity')).toHaveText('2')

    // Detail page: adding 1 more of 1/50 exceeds the remaining stock.
    await gotoReady(page, `/nft/${SLUG}`)
    await page.getByRole('radiogroup', { name: 'Edição:' }).getByRole('radio', { name: '1/50', exact: true }).click()
    const scope = isMobile ? page.getByTestId('mobile-buy-bar') : page.getByTestId('desktop-purchase')
    await scope.getByRole('button', { name: isMobile ? 'Comprar NFT' : 'COMPRAR', exact: true }).click()
    await expect(scope.getByTestId('add-to-cart-error')).toHaveText(
      'Quantidade indisponível: o máximo permitido para esta edição é 2 unidades.',
    )
    await expect(page).toHaveURL(new RegExp(`/nft/${SLUG}$`))
  })
})
