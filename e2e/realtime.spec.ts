import type { Page, Request } from '@playwright/test'
import { expect, gotoReady, pageFetch, setRealtimeOnline, test } from './fixtures'

/**
 * P5-01 realtime: the real `socket.io-client` (websocket transport) talks to
 * the MSW Socket.IO simulation in the page. Dev controls:
 * `POST /api/__dev/nfts/:id` (commit → `nft.updated`), `PUT /api/__dev/realtime`
 * `{ online }` (outage), `POST /api/__dev/realtime/emit` (hand-built events),
 * `GET /api/__dev/realtime` (connections).
 * Seed: Emerald Ape #042 (nft_001) 1.19 ETH, version 1, edition 1/50 (10 left).
 */

const READY = { timeout: 20_000 }
const COLLECTOR = { email: 'colecionador@kurio.test', password: 'Colecionador2026' }

const json = (body: unknown, headers: Record<string, string> = {}, method = 'POST'): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json', ...headers },
  body: JSON.stringify(body),
})

/** Unit price on desktop; on mobile the sticky bar subtotal (quantity 1 = unit price). */
function visiblePrice(page: Page) {
  return page.locator('[data-testid="nft-price"]:visible, [data-testid="mobile-subtotal"]:visible')
}

async function patchNft(page: Page, body: Record<string, unknown>) {
  const result = await pageFetch(page, '/api/__dev/nfts/nft_001', json(body))
  expect(result.status, result.body).toBe(200)
  return JSON.parse(result.body) as { version: number }
}

async function connections(page: Page): Promise<{ userId: string | null }[]> {
  const result = await pageFetch(page, '/api/__dev/realtime')
  return (JSON.parse(result.body) as { connections: { userId: string | null }[] }).connections
}

async function expectConnected(page: Page, userId: string | null = null) {
  await expect.poll(() => connections(page), READY).toEqual([{ userId }])
  await expect(page.getByTestId('realtime-status')).toHaveAttribute('data-state', 'connected')
}

function nftEvent(version: number, price: string, eventId: string = crypto.randomUUID()) {
  return {
    eventId,
    type: 'nft.updated',
    schemaVersion: 1,
    resource: { type: 'nft', id: 'nft_001' },
    version,
    occurredAt: new Date().toISOString(),
    data: {
      nftId: 'nft_001',
      price,
      previousPrice: null,
      totalAvailable: 50,
      editions: [{ editionId: 'nft_001-1of50', available: 10 }],
    },
  }
}

async function emit(page: Page, event: unknown): Promise<number> {
  const result = await pageFetch(page, '/api/__dev/realtime/emit', json(event))
  expect(result.status, result.body).toBe(200)
  return (JSON.parse(result.body) as { delivered: number }).delivered
}

/** Records REST reads of the NFT so a test can prove an update came over the socket. */
function trackDetailReads(page: Page): Request[] {
  const reads: Request[] = []
  page.on('request', (request) => {
    if (/\/api\/nfts\/(nft_001|emerald-ape-042)$/.test(new URL(request.url()).pathname) && request.method() === 'GET') {
      reads.push(request)
    }
  })
  return reads
}

test.describe('realtime: nft.updated', () => {
  test('detail page applies a price/stock change pushed over Socket.IO, without refetching', async ({ page }) => {
    await gotoReady(page, '/nft/emerald-ape-042')
    await expect(visiblePrice(page)).toContainText('1.19 ETH', READY)
    await expectConnected(page)

    const reads = trackDetailReads(page)
    await patchNft(page, { price: '1.5', previousPrice: '1.19' })

    await expect(visiblePrice(page)).toContainText('1.50 ETH', READY)
    await expect(page.getByTestId('realtime-announcer')).toHaveText(/Emerald Ape #042 foi atualizado: 1\.50 ETH/)
    expect(reads, 'the change came over the socket, not REST').toHaveLength(0)
  })

  test('stale (older/equal version) events are ignored; newer ones apply', async ({ page }) => {
    await gotoReady(page, '/nft/emerald-ape-042')
    await expect(visiblePrice(page)).toContainText('1.19 ETH', READY)
    await expectConnected(page)
    const { version } = await patchNft(page, { price: '2' })
    await expect(visiblePrice(page)).toContainText('2.00 ETH', READY)

    expect(await emit(page, nftEvent(version, '9'))).toBe(1)
    expect(await emit(page, nftEvent(version - 1, '8'))).toBe(1)
    const newer = nftEvent(version + 1, '3')
    expect(await emit(page, newer)).toBe(1)
    await expect(visiblePrice(page)).toContainText('3.00 ETH', READY)

    // Same eventId again (even with another payload) is a duplicate.
    expect(await emit(page, { ...newer, version: version + 2, data: { ...newer.data, price: '7' } })).toBe(1)
    await page.waitForTimeout(300)
    await expect(visiblePrice(page)).toContainText('3.00 ETH')
  })

  test('outage → banner; missed changes are reconciled over REST after reconnecting', async ({ page }) => {
    await gotoReady(page, '/nft/emerald-ape-042')
    await expect(visiblePrice(page)).toContainText('1.19 ETH', READY)
    await expectConnected(page)

    await setRealtimeOnline(page, false)
    const banner = page.getByTestId('realtime-status').getByRole('status')
    await expect(banner).toHaveText('Atualizações em tempo real indisponíveis. Reconectando…', READY)

    // Missed while offline: no socket delivers it.
    await patchNft(page, { price: '4.2', editions: [{ id: 'nft_001-1of50', available: 3 }] })
    await page.waitForTimeout(500)
    await expect(visiblePrice(page)).toContainText('1.19 ETH')

    const refetched = page.waitForResponse((r) => r.url().endsWith('/api/nfts/emerald-ape-042') && r.status() === 200, READY)
    await setRealtimeOnline(page, true)
    await refetched
    await expect(banner).toBeHidden(READY)
    await expect(visiblePrice(page)).toContainText('4.20 ETH', READY)
    await expectConnected(page)
  })
})

test.describe('realtime: session isolation and checkout', () => {
  test('socket follows the session: guest → user → guest after logout', async ({ page }) => {
    await gotoReady(page, '/')
    await expectConnected(page, null)

    const login = await pageFetch(page, '/api/auth/login', json(COLLECTOR))
    const { session } = JSON.parse(login.body) as { session: { token: string; expiresAt: string; user: { id: string } } }
    await page.evaluate(
      (value) => window.localStorage.setItem('kurio.session', value),
      JSON.stringify({ token: session.token, userId: session.user.id, expiresAt: session.expiresAt }),
    )
    await gotoReady(page, '/perfil')
    await expectConnected(page, session.user.id)

    await page.getByTestId('profile-summary').getByRole('button', { name: 'Sair' }).click()
    await expect(page).toHaveURL(/\/$/, READY)
    await expectConnected(page, null)
  })

  test('a price change during checkout blocks confirmation until the new quote is accepted', async ({ page }) => {
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

    await gotoReady(page, '/checkout')
    await expect(page.getByTestId('checkout-total')).toHaveText('2.396 ETH', READY)
    await expectConnected(page, session.user.id)

    await patchNft(page, { price: '1.5' })
    const review = page.getByTestId('checkout-review')
    await expect(review).toContainText('Os valores do seu pedido mudaram. Revise e confirme novamente.', READY)
    await expect(page.getByTestId('checkout-total')).toHaveText('3.016 ETH', READY)
  })
})
