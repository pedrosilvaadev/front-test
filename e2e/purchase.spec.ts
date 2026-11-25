import type { Page } from '@playwright/test'
import { expect, gotoReady, pageFetch, setRealtimeOnline, test } from './fixtures'

/**
 * P6-01 README §9 groups 6, 7, 9 (cart), 10 and 12:
 *  - complete purchase through the UI, from the catalog to the confirmed receipt;
 *  - repeated clicks on "Confirmar compra" create exactly one order;
 *  - a price change pushed over Socket.IO while on the cart is announced and re-prices the summary;
 *  - `order.updated` pushes the confirmation; a pending order survives a socket outage and is
 *    reconciled after reconnecting, without a second purchase;
 *  - cart skeleton under slow responses, error feedback and recovery after retry.
 * Seed: Emerald Ape #042 (nft_001) 1.19 ETH; demo collector has a primary Ethereum wallet.
 */

const READY = { timeout: 20_000 }
const COLLECTOR = { email: 'colecionador@kurio.test', password: 'Colecionador2026' }

const json = (body: unknown, headers: Record<string, string> = {}, method = 'POST'): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json', ...headers },
  body: JSON.stringify(body),
})

async function signInStored(page: Page): Promise<string> {
  const login = await pageFetch(page, '/api/auth/login', json(COLLECTOR))
  const { session } = JSON.parse(login.body) as { session: { token: string; expiresAt: string; user: { id: string } } }
  await page.evaluate(
    (value) => window.localStorage.setItem('kurio.session', value),
    JSON.stringify({ token: session.token, userId: session.user.id, expiresAt: session.expiresAt }),
  )
  return session.token
}

async function addToCart(page: Page, token: string, quantity = 2) {
  const result = await pageFetch(
    page,
    '/api/cart/items',
    json({ nftId: 'nft_001', editionId: 'nft_001-1of50', quantity }, { Authorization: `Bearer ${token}` }),
  )
  expect(result.status, result.body).toBe(200)
}

async function listOrders(page: Page, token: string): Promise<{ id: string; status: string }[]> {
  const result = await pageFetch(page, '/api/orders', { headers: { Authorization: `Bearer ${token}` } })
  return (JSON.parse(result.body) as { items: { id: string; status: string }[] }).items
}

async function devCheckout(page: Page, controls: Record<string, unknown>) {
  const result = await pageFetch(page, '/api/__dev/checkout', json(controls, {}, 'PUT'))
  expect(result.status, result.body).toBe(200)
}

function confirmButton(page: Page) {
  return page.getByRole('button', { name: 'Confirmar compra' })
}

async function openCheckout(page: Page, total = '2.396 ETH') {
  await gotoReady(page, '/checkout')
  await expect(page.getByTestId('checkout-form')).toBeVisible(READY)
  await expect(page.getByTestId('checkout-total')).toHaveText(total, READY)
}

test.describe('purchase journey', () => {
  test('catalog → detail → cart → login → checkout → confirmed receipt', async ({ page, isMobile }) => {
    await gotoReady(page, '/?q=Emerald')
    const card = page.getByTestId('nft-card').filter({ hasText: 'Emerald Ape #042' })
    await card.getByRole('link', { name: /Emerald Ape #042/ }).first().click()
    await expect(page).toHaveURL(/\/nft\/emerald-ape-042$/, READY)
    await expect(page.getByRole('heading', { level: 1, name: 'Emerald Ape #042' })).toBeVisible(READY)

    await page.getByRole('radiogroup', { name: 'Edição:' }).getByRole('radio', { name: '1/50', exact: true }).click()
    const scope = isMobile ? page.getByTestId('mobile-buy-bar') : page.getByTestId('desktop-purchase')
    await scope.getByRole('button', { name: 'Aumentar quantidade' }).click()
    await scope.getByRole('button', { name: isMobile ? 'Comprar NFT' : 'COMPRAR', exact: true }).click()

    await expect(page).toHaveURL(/\/carrinho$/, READY)
    await expect(page.getByTestId('cart-line-quantity')).toHaveText('2', READY)
    await expect(page.getByTestId('cart-total')).toHaveText('2.396 ETH', READY)
    await page.getByRole('link', { name: 'Conectar e finalizar' }).click()

    await expect(page).toHaveURL(/\/login\?redirect=%2Fcheckout$/, READY)
    const auth = page.getByRole('dialog')
    await auth.getByLabel('E-mail').fill(COLLECTOR.email)
    await auth.getByLabel('Senha', { exact: true }).fill(COLLECTOR.password)
    await auth.getByRole('button', { name: 'Entrar', exact: true }).click()

    await expect(page).toHaveURL(/\/checkout$/, READY)
    await expect(page.getByTestId('checkout-total')).toHaveText('2.396 ETH', READY)
    await confirmButton(page).click()

    await expect(page).toHaveURL(/\/pedidos\/ord_[0-9a-f]+$/, READY)
    const receipt = page.getByTestId('order-receipt')
    await expect(receipt).toBeVisible(READY)
    await expect(receipt.getByTestId('receipt-line-name')).toHaveText(['Emerald Ape #042'])
    await expect(receipt.getByTestId('receipt-total')).toHaveText('2.396 ETH')
  })

  test('repeated clicks on "Confirmar compra" create exactly one order', async ({ page }) => {
    const token = await signInStored(page)
    await addToCart(page, token)
    await devCheckout(page, { resolveDelayMs: 1500 })
    await openCheckout(page)

    await confirmButton(page).dblclick()
    await expect(page).toHaveURL(/\/pedidos\/ord_[0-9a-f]+$/, READY)
    await expect(page.getByTestId('order-receipt')).toBeVisible(READY)
    expect(await listOrders(page, token)).toHaveLength(1)
  })
})

test.describe('realtime during the purchase', () => {
  test('a price change on the cart page is announced and re-prices the summary', async ({ page }) => {
    const token = await signInStored(page)
    await addToCart(page, token)
    await gotoReady(page, '/carrinho')
    await expect(page.getByTestId('cart-total')).toHaveText('2.396 ETH', READY)
    await expect(page.getByTestId('realtime-status')).toHaveAttribute('data-state', 'connected', READY)

    const patched = await pageFetch(page, '/api/__dev/nfts/nft_001', json({ price: '1.5' }))
    expect(patched.status).toBe(200)
    await expect(page.getByTestId('realtime-announcer')).toHaveText(/Emerald Ape #042 foi atualizado: 1\.50 ETH/, READY)
    await expect(page.getByTestId('cart-total')).toHaveText('3.016 ETH', READY)
    await expect(page.getByTestId('quote-changes')).toBeVisible()
  })

  test('order.updated pushes the confirmation of a pending order', async ({ page }) => {
    const token = await signInStored(page)
    await addToCart(page, token)
    await devCheckout(page, { orderOutcome: 'pending' })
    await openCheckout(page)
    await confirmButton(page).click()
    await expect(page.getByTestId('order-pending')).toBeVisible(READY)
    await expect(page.getByTestId('realtime-status')).toHaveAttribute('data-state', 'connected', READY)

    const [order] = await listOrders(page, token)
    const resolved = await pageFetch(page, `/api/__dev/orders/${order?.id ?? ''}/resolve`, json({ status: 'declined' }))
    expect(resolved.status).toBe(200)
    await expect(page.getByTestId('realtime-announcer')).toHaveText('Pagamento recusado.', READY)
    await expect(page.getByTestId('order-pending')).toBeHidden(READY)
  })

  test('pending order + socket outage: reconnecting recovers the result without a second purchase', async ({ page }) => {
    const token = await signInStored(page)
    await addToCart(page, token)
    await devCheckout(page, { orderOutcome: 'pending' })
    await openCheckout(page)
    await confirmButton(page).click()
    await expect(page.getByTestId('order-pending')).toBeVisible(READY)
    await expect(page.getByTestId('realtime-status')).toHaveAttribute('data-state', 'connected', READY)

    await setRealtimeOnline(page, false)
    await expect(page.getByTestId('realtime-status').getByRole('status')).toBeVisible(READY)
    const [order] = await listOrders(page, token)
    // Resolved while the socket is down: the event is lost.
    const resolved = await pageFetch(page, `/api/__dev/orders/${order?.id ?? ''}/resolve`, json({ status: 'confirmed' }))
    expect(resolved.status).toBe(200)

    await setRealtimeOnline(page, true)
    await expect(page.getByTestId('realtime-status')).toHaveAttribute('data-state', 'connected', READY)
    await expect(page.getByTestId('order-receipt')).toBeVisible(READY)
    await expect(page.getByTestId('order-receipt').getByTestId('receipt-total')).toHaveText('2.396 ETH')
    const orders = await listOrders(page, token)
    expect(orders).toHaveLength(1)
    expect(orders[0]).toMatchObject({ id: order?.id, status: 'confirmed' })
  })
})

test.describe('cart loading and failure', () => {
  test('slow responses show the cart skeleton; a server error offers a retry that recovers', async ({ page }) => {
    // Guest cart: with a failing API a stored session is downgraded to guest, so a user cart would not load at all.
    const guest = '77777777-7777-4777-8777-777777777777'
    await page.evaluate((id) => window.localStorage.setItem('kurio.guestCartId', id), guest)
    const seeded = await pageFetch(
      page,
      '/api/cart/items',
      json({ nftId: 'nft_001', editionId: 'nft_001-1of50', quantity: 1 }, { 'X-Guest-Cart-Id': guest }),
    )
    expect(seeded.status, seeded.body).toBe(200)

    await gotoReady(page, '/carrinho?scenario=slow')
    await expect(page.getByTestId('cart-skeleton')).toBeVisible(READY)
    await expect(page.getByTestId('cart-lines')).toBeVisible(READY)
    await expect(page.getByTestId('cart-skeleton')).toHaveCount(0)

    await gotoReady(page, '/carrinho?scenario=server-error')
    const error = page.getByTestId('cart-error')
    await expect(error).toBeVisible(READY)
    const restored = await pageFetch(page, '/api/__dev/scenario', json({ name: 'default' }, {}, 'PUT'))
    expect(restored.status).toBe(200)
    await error.getByRole('button', { name: 'Tentar novamente' }).click()
    await expect(page.getByTestId('cart-lines')).toBeVisible(READY)
    await expect(page.getByTestId('cart-total')).toHaveText('1.206 ETH', READY)
  })
})
