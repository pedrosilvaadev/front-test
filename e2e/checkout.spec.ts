import type { Page } from '@playwright/test'
import { expect, gotoReady, pageFetch, setRealtimeOnline, test, waitForMockWorker } from './fixtures'

/**
 * P4-02 checkout + idempotent orders + immutable receipt (desktop + mobile).
 * The demo collector has a seeded primary Ethereum wallet (MetaMask), which
 * prefills the form. Dev controls: `PUT /api/__dev/checkout`
 * (`orderOutcome`, `resolveDelayMs`, `walletConnect`, `dropNextOrderResponses`),
 * `POST /api/__dev/orders/:id/resolve`, `POST /api/__dev/nfts/:id`.
 * Seed: Emerald Ape #042 (nft_001) 1.19 ETH, edition 1/50 (10 left).
 */

const READY = { timeout: 20_000 }
const COLLECTOR = { email: 'colecionador@kurio.test', password: 'Colecionador2026' }
const GUEST = '66666666-6666-4666-8666-666666666666'

const json = (body: unknown, headers: Record<string, string> = {}, method = 'POST'): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json', ...headers },
  body: JSON.stringify(body),
})

async function devCheckout(page: Page, controls: Record<string, unknown>) {
  const result = await pageFetch(page, '/api/__dev/checkout', json(controls, {}, 'PUT'))
  expect(result.status, result.body).toBe(200)
}

/** Signs in through the API and stores the session like the app does (skips the form). */
async function signInStored(page: Page): Promise<string> {
  const login = await pageFetch(page, '/api/auth/login', json(COLLECTOR))
  const { session } = JSON.parse(login.body) as { session: { token: string; expiresAt: string; user: { id: string } } }
  await page.evaluate(
    (value) => window.localStorage.setItem('kurio.session', value),
    JSON.stringify({ token: session.token, userId: session.user.id, expiresAt: session.expiresAt }),
  )
  return session.token
}

async function addToUserCart(page: Page, token: string, quantity = 2) {
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

async function openCheckout(page: Page, total = '2.396 ETH') {
  await gotoReady(page, '/checkout')
  await expect(page.getByTestId('checkout-form')).toBeVisible(READY)
  await expect(page.getByTestId('checkout-total')).toHaveText(total, READY)
}

function confirmButton(page: Page) {
  return page.getByRole('button', { name: 'Confirmar compra' })
}

async function expectReceipt(page: Page, total: string) {
  const receipt = page.getByTestId('order-receipt')
  await expect(receipt).toBeVisible(READY)
  await expect(receipt.getByRole('heading', { name: 'Seus NFTs agora estão na sua carteira' })).toBeVisible()
  await expect(receipt.getByTestId('receipt-line-name')).toHaveText(['Emerald Ape #042'])
  await expect(receipt.getByTestId('receipt-fee')).toHaveText('0.016 ETH')
  await expect(receipt.getByTestId('receipt-total')).toHaveText(total)
  await expect(receipt.getByTestId('receipt-tx')).toHaveText(/^0x[0-9A-F]{4}…[0-9A-F]{4}$/)
  await expect(receipt.getByRole('link', { name: 'Ver no Etherscan' })).toHaveAttribute('href', /^https:\/\/etherscan\.io\/tx\/0x[0-9a-f]{64}$/)
}

test.describe('checkout', () => {
  test('guest cart → login → checkout → confirmed receipt; the cart is emptied', async ({ page }) => {
    await page.evaluate((id) => window.localStorage.setItem('kurio.guestCartId', id), GUEST)
    const seeded = await pageFetch(page, '/api/cart/items', json({ nftId: 'nft_001', editionId: 'nft_001-1of50', quantity: 2 }, { 'X-Guest-Cart-Id': GUEST }))
    expect(seeded.status).toBe(200)

    await gotoReady(page, '/carrinho')
    await page.getByRole('link', { name: 'Conectar e finalizar' }).click()
    await expect(page).toHaveURL(/\/login\?redirect=%2Fcheckout$/, READY)
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('E-mail').fill(COLLECTOR.email)
    await dialog.getByLabel('Senha', { exact: true }).fill(COLLECTOR.password)
    await dialog.getByRole('button', { name: 'Entrar', exact: true }).click()

    await expect(page).toHaveURL(/\/checkout$/, READY)
    await expect(page.getByTestId('checkout-total')).toHaveText('2.396 ETH', READY)
    await expect(page.getByTestId('checkout-form').getByRole('combobox', { name: /^Rede/ })).toHaveValue('ethereum')
    await expect(page.getByRole('radio', { name: 'MetaMask' })).toBeChecked()
    await confirmButton(page).click()

    await expect(page).toHaveURL(/\/pedidos\/ord_[0-9a-f]+$/, READY)
    await expectReceipt(page, '2.396 ETH')
    await expect(page.getByTestId('cart-nav-link').filter({ visible: true })).toHaveAccessibleName('Carrinho', READY)
  })

  test('validation errors are announced and focus the first invalid field', async ({ page }) => {
    const token = await signInStored(page)
    await addToUserCart(page, token)
    await openCheckout(page)
    await page.getByTestId('checkout-form').getByRole('textbox', { name: /^Código de indicação/ }).fill('x')
    await page.getByTestId('checkout-form').getByRole('textbox', { name: /^E-mail/ }).fill('not-an-email')
    await confirmButton(page).click()
    await expect(page.getByTestId('checkout-form').getByRole('textbox', { name: /^Código de indicação/ })).toBeFocused()
    await expect(page.getByTestId('checkout-form').getByRole('textbox', { name: /^Código de indicação/ })).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByText('Informe um e-mail válido.')).toBeVisible()
    expect(await listOrders(page, token)).toEqual([])
  })

  test('a price change between quote and payment requires explicit re-confirmation', async ({ page }) => {
    const token = await signInStored(page)
    await addToUserCart(page, token)
    await openCheckout(page)
    // Realtime down: the change is only caught by the server revalidation on confirm
    // (the pushed path is covered in e2e/realtime.spec.ts).
    await setRealtimeOnline(page, false)
    const patched = await pageFetch(page, '/api/__dev/nfts/nft_001', json({ price: '1.29' }))
    expect(patched.status).toBe(200)

    await confirmButton(page).click()
    const review = page.getByTestId('checkout-review')
    await expect(review).toBeVisible(READY)
    await expect(review).toContainText('O preço de Emerald Ape #042 mudou de 1.19 ETH para 1.29 ETH.')
    await expect(page.getByTestId('checkout-total')).toHaveText('2.596 ETH')
    await expect(confirmButton(page)).toBeDisabled()
    expect(await listOrders(page, token)).toEqual([])

    await review.getByRole('button', { name: 'Aceitar novos valores' }).click()
    await expect(confirmButton(page)).toBeEnabled()
    await confirmButton(page).click()
    await expectReceipt(page, '2.596 ETH')
  })

  test('a lost response is retried with the same key: exactly one order', async ({ page }) => {
    const token = await signInStored(page)
    await addToUserCart(page, token)
    await devCheckout(page, { dropNextOrderResponses: 1 })
    await openCheckout(page)
    await confirmButton(page).click()
    await expect(page.getByTestId('checkout-error-message')).toContainText('Sua tentativa foi guardada', READY)
    const attempt = await page.evaluate(() => window.localStorage.getItem('kurio.checkoutAttempt.usr_001'))
    expect(attempt).toContain('"idempotencyKey"')
    expect(await listOrders(page, token)).toHaveLength(1)

    await confirmButton(page).click()
    await expect(page).toHaveURL(/\/pedidos\/ord_[0-9a-f]+$/, READY)
    await expectReceipt(page, '2.396 ETH')
    expect(await listOrders(page, token)).toHaveLength(1)
    const key = (JSON.parse(attempt ?? '{}') as { idempotencyKey?: string }).idempotencyKey
    const orders = await pageFetch(page, '/api/orders', { headers: { Authorization: `Bearer ${token}` } })
    expect((JSON.parse(orders.body) as { items: { idempotencyKey: string }[] }).items[0]?.idempotencyKey).toBe(key)
  })

  test('a lost response confirmed in the background leads to the receipt without a second click', async ({ page }) => {
    const token = await signInStored(page)
    await addToUserCart(page, token)
    await devCheckout(page, { dropNextOrderResponses: 1, resolveDelayMs: 1500 })
    await openCheckout(page)
    await confirmButton(page).click()
    await expect(page.getByTestId('checkout-error-message')).toContainText('Sua tentativa foi guardada', READY)

    // No retry click: the order confirms server side, the cart empties (order.updated) and the
    // stored attempt is replayed with the same key → receipt, still exactly one order.
    await expect(page).toHaveURL(/\/pedidos\/ord_[0-9a-f]+$/, READY)
    await expectReceipt(page, '2.396 ETH')
    expect(await listOrders(page, token)).toHaveLength(1)
  })

  test('declined payment shows the reason and a new attempt succeeds with a new key', async ({ page }) => {
    const token = await signInStored(page)
    await addToUserCart(page, token)
    await devCheckout(page, { orderOutcome: 'decline', resolveDelayMs: 0 })
    await openCheckout(page)
    await confirmButton(page).click()
    const declined = page.getByTestId('order-declined')
    await expect(declined).toBeVisible(READY)
    await expect(declined.getByTestId('order-decline-reason')).toHaveText('Pagamento recusado pela carteira.')

    await devCheckout(page, { orderOutcome: 'confirm', resolveDelayMs: 0 })
    await declined.getByRole('link', { name: 'Tentar novamente' }).click()
    await expect(page.getByTestId('checkout-total')).toHaveText('2.396 ETH', READY)
    await confirmButton(page).click()
    await expectReceipt(page, '2.396 ETH')
    const orders = await listOrders(page, token)
    expect(orders.map((order) => order.status).sort()).toEqual(['confirmed', 'declined'])
  })

  test('pending survives a refresh; the receipt never changes after a price change', async ({ page }) => {
    const token = await signInStored(page)
    await addToUserCart(page, token)
    await devCheckout(page, { orderOutcome: 'pending' })
    await openCheckout(page)
    await confirmButton(page).click()
    await expect(page.getByTestId('order-pending')).toBeVisible(READY)
    const orderUrl = page.url()

    await page.reload()
    await waitForMockWorker(page)
    await expect(page.getByTestId('order-pending')).toBeVisible(READY)
    const [order] = await listOrders(page, token)
    expect(order?.status).toBe('pending')
    const resolved = await pageFetch(page, `/api/__dev/orders/${order?.id ?? ''}/resolve`, json({ status: 'confirmed' }))
    expect(resolved.status).toBe(200)
    await expectReceipt(page, '2.396 ETH')

    const patched = await pageFetch(page, '/api/__dev/nfts/nft_001', json({ price: '3.5' }))
    expect(patched.status).toBe(200)
    await gotoReady(page, new URL(orderUrl).pathname)
    await expectReceipt(page, '2.396 ETH')
    await expect(page.getByTestId('receipt-line-total')).toHaveText('2.38 ETH')
  })

  test('no horizontal overflow on the checkout page', async ({ page }) => {
    const token = await signInStored(page)
    await addToUserCart(page, token)
    await openCheckout(page)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
  })
})
