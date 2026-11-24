import { afterEach, describe, expect, it } from 'vitest'
import { createApiClient } from '@/api/client'
import { isApiError, type ApiError } from '@/api/errors'
import { authResponseSchema, cartSchema, quoteSchema, type AuthResponse, type Cart, type Quote } from '@/contracts'
import { patchNft } from '../catalog'
import { getDb, initDb, resetDb } from '../db'
import { DEMO_CREDENTIALS } from '../fixtures/users'
import { expireSessions } from '../sessions'

/**
 * P4-01 cart + quote mock (docs/API_CONTRACTS.md "Cart", "Quote"; ADR-006).
 * Seed facts used below (src/mocks/fixtures/nfts.ts): nft_001 "Emerald Ape
 * #042" 1.19 ETH, editions 1of1 (1 left, max 1), 1of10 (2 left, max 3),
 * 1of50 (10 left, max 5), open (100 left, max 10); nft_002 "Sage Nomad #009"
 * 1.69 ETH. Coupons: KURIO10 (10%), LANCAMENTO (0.5 ETH), EXPIRADO (expired).
 */
const client = createApiClient({ baseURL: '/api', timeoutMs: 5000 })
const GUEST_A = '11111111-1111-4111-8111-111111111111'
const GUEST_B = '22222222-2222-4222-8222-222222222222'

type Owner = { guest: string } | { token: string }

function config(owner: Owner) {
  return 'guest' in owner
    ? { skipAuth: true, headers: { 'X-Guest-Cart-Id': owner.guest } }
    : { skipAuth: true, headers: { Authorization: `Bearer ${owner.token}` } }
}

async function capture(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise
  } catch (error) {
    if (isApiError(error)) return error
    throw error
  }
  throw new Error('Expected request to fail')
}

const getCart = async (owner: Owner) => cartSchema.parse((await client.get<unknown>('/cart', config(owner))).data)
const add = async (owner: Owner, nftId: string, editionId: string, quantity: number): Promise<Cart> =>
  cartSchema.parse((await client.post<unknown>('/cart/items', { nftId, editionId, quantity }, config(owner))).data)
const patch = async (owner: Owner, itemId: string, quantity: number): Promise<Cart> =>
  cartSchema.parse((await client.patch<unknown>(`/cart/items/${itemId}`, { quantity }, config(owner))).data)
const remove = async (owner: Owner, itemId: string): Promise<Cart> =>
  cartSchema.parse((await client.delete<unknown>(`/cart/items/${itemId}`, config(owner))).data)
const applyCoupon = async (owner: Owner, code: string): Promise<Cart> =>
  cartSchema.parse((await client.put<unknown>('/cart/coupon', { code }, config(owner))).data)
async function quote(owner: Owner, previousQuoteId?: string): Promise<Quote> {
  const response = await client.post<unknown>('/quotes', previousQuoteId ? { previousQuoteId } : {}, config(owner))
  expect(response.status).toBe(201)
  return quoteSchema.parse(response.data)
}
async function login(guestCartId?: string, credentials = DEMO_CREDENTIALS.collector): Promise<AuthResponse> {
  const body = guestCartId ? { ...credentials, guestCartId } : credentials
  return authResponseSchema.parse((await client.post<unknown>('/auth/login', body, { skipAuth: true })).data)
}

afterEach(() => {
  initDb(undefined)
  resetDb()
})

describe('cart owner resolution', () => {
  it('requires a bearer token or a UUID guest cart id (400 GUEST_CART_ID_REQUIRED)', async () => {
    const missing = await capture(client.get('/cart', { skipAuth: true }))
    expect([missing.status, missing.code]).toEqual([400, 'GUEST_CART_ID_REQUIRED'])
    const invalid = await capture(client.get('/cart', config({ guest: 'not-a-uuid' })))
    expect(invalid.code).toBe('GUEST_CART_ID_REQUIRED')
    const quoteMissing = await capture(client.post('/quotes', {}, { skipAuth: true }))
    expect(quoteMissing.code).toBe('GUEST_CART_ID_REQUIRED')
  })

  it('answers an empty cart for a new owner without persisting it', async () => {
    const cart = await getCart({ guest: GUEST_A })
    expect(cart).toMatchObject({ owner: 'guest', items: [], coupon: null, itemCount: 0, version: 0 })
    expect(getDb().carts).toHaveLength(0)
  })

  it('isolates guests and users; the bearer wins over the guest header; bad tokens are 401', async () => {
    await add({ guest: GUEST_A }, 'nft_001', 'nft_001-1of50', 2)
    expect((await getCart({ guest: GUEST_B })).items).toHaveLength(0)

    const { session } = await login()
    const both = await client.get<unknown>('/cart', {
      skipAuth: true,
      headers: { Authorization: `Bearer ${session.token}`, 'X-Guest-Cart-Id': GUEST_A },
    })
    expect(cartSchema.parse(both.data)).toMatchObject({ owner: 'user', items: [] })

    const bad = await capture(client.get('/cart', config({ token: 'f'.repeat(64) })))
    expect([bad.status, bad.code]).toEqual([401, 'UNAUTHORIZED'])
    expireSessions()
    const expired = await capture(client.get('/cart', config({ token: session.token })))
    expect(expired.code).toBe('SESSION_EXPIRED')
  })
})

describe('cart mutations', () => {
  const owner = { guest: GUEST_A }

  it('adds to the same line, bumps the version and counts units', async () => {
    const first = await add(owner, 'nft_001', 'nft_001-1of50', 2)
    expect(first.version).toBe(1)
    expect(first.items).toHaveLength(1)
    expect(first.items[0]).toMatchObject({
      nftId: 'nft_001',
      editionId: 'nft_001-1of50',
      quantity: 2,
      nft: { name: 'Emerald Ape #042', editionLabel: '1/50', unitPrice: '1.19', available: 10, maxQuantity: 5 },
    })
    const second = await add(owner, 'nft_001', 'nft_001-1of50', 1)
    expect(second.items).toHaveLength(1)
    expect(second.items[0]?.id).toBe(first.items[0]?.id)
    expect(second.items[0]?.quantity).toBe(3)
    const third = await add(owner, 'nft_002', 'nft_002-open', 4)
    expect(third).toMatchObject({ itemCount: 7, version: 3 })
    // Persisted: a fresh read returns the same cart.
    expect(await getCart(owner)).toEqual(third)
  })

  it('409 AVAILABILITY_CONFLICT with the allowed max leaves the cart unchanged', async () => {
    const before = await add(owner, 'nft_001', 'nft_001-1of10', 2)
    const error = await capture(add(owner, 'nft_001', 'nft_001-1of10', 1))
    expect([error.status, error.code]).toEqual([409, 'AVAILABILITY_CONFLICT'])
    expect(error.details).toEqual({ nftId: 'nft_001', editionId: 'nft_001-1of10', requested: 3, available: 2, maxQuantity: 2 })
    // maxPerOrder bound (open: 100 left, max 10).
    const perOrder = await capture(add(owner, 'nft_001', 'nft_001-open', 11))
    expect(perOrder.details).toMatchObject({ requested: 11, available: 100, maxQuantity: 10 })
    expect(await getCart(owner)).toEqual(before)
  })

  it('validates bodies and references (422 / 404)', async () => {
    expect((await capture(add(owner, 'nft_001', 'nft_001-1of50', 0))).code).toBe('VALIDATION_ERROR')
    expect((await capture(add(owner, 'nft_001', 'nft_001-1of50', 1.5))).code).toBe('VALIDATION_ERROR')
    expect((await capture(add(owner, 'nft_999', 'x', 1))).code).toBe('NFT_NOT_FOUND')
    expect((await capture(add(owner, 'emerald-ape-042', 'nft_001-1of50', 1))).code).toBe('NFT_NOT_FOUND')
    expect((await capture(add(owner, 'nft_001', 'nft_002-open', 1))).code).toBe('EDITION_NOT_FOUND')
    expect((await capture(patch(owner, 'ci_missing', 1))).code).toBe('CART_ITEM_NOT_FOUND')
    const malformed = await fetch(new URL('/api/cart/items', window.location.origin), {
      method: 'POST',
      headers: { 'X-Guest-Cart-Id': GUEST_A, 'Content-Type': 'application/json' },
      body: '{',
    })
    expect(malformed.status).toBe(400)
    expect(await malformed.json()).toMatchObject({ error: { code: 'INVALID_JSON' } })
  })

  it('PATCH sets the absolute quantity (bounded); DELETE is idempotent', async () => {
    const cart = await add(owner, 'nft_001', 'nft_001-1of50', 1)
    const itemId = cart.items[0]!.id
    expect((await patch(owner, itemId, 5)).items[0]?.quantity).toBe(5)
    const conflict = await capture(patch(owner, itemId, 6))
    expect(conflict.details).toMatchObject({ requested: 6, maxQuantity: 5 })
    const removed = await remove(owner, itemId)
    expect(removed).toMatchObject({ items: [], itemCount: 0, version: 3 })
    const again = await remove(owner, itemId)
    expect(again.version).toBe(3)
  })
})

describe('coupons', () => {
  const owner = { guest: GUEST_A }

  it('applies case-insensitive codes and rejects invalid / expired ones', async () => {
    await add(owner, 'nft_001', 'nft_001-1of50', 1)
    const applied = await applyCoupon(owner, ' kurio10 ')
    expect(applied.coupon).toEqual({ code: 'KURIO10', kind: 'percent', percent: '10', label: '10% de desconto' })
    const invalid = await capture(applyCoupon(owner, 'NOPE'))
    expect([invalid.status, invalid.code]).toEqual([422, 'COUPON_INVALID'])
    const expired = await capture(applyCoupon(owner, 'expirado'))
    expect(expired.code).toBe('COUPON_EXPIRED')
    expect((await getCart(owner)).coupon?.code).toBe('KURIO10')
    const cleared = cartSchema.parse((await client.delete<unknown>('/cart/coupon', config(owner))).data)
    expect(cleared.coupon).toBeNull()
  })
})

describe('POST /api/quotes', () => {
  const owner = { guest: GUEST_A }

  it('prices with decimal arithmetic (0.1 + 0.2), coupon and fee', async () => {
    patchNft('nft_001', { price: '0.1' })
    patchNft('nft_002', { price: '0.2' })
    await add(owner, 'nft_001', 'nft_001-1of50', 1)
    await add(owner, 'nft_002', 'nft_002-1of50', 1)
    const plain = await quote(owner)
    expect(plain).toMatchObject({ subtotal: '0.3', discount: '0', networkFee: '0.016', total: '0.316', purchasable: true, changes: [] })
    expect(Date.parse(plain.expiresAt) - Date.parse(plain.issuedAt)).toBe(5 * 60 * 1000)

    await applyCoupon(owner, 'KURIO10')
    expect(await quote(owner)).toMatchObject({ subtotal: '0.3', discount: '0.03', total: '0.286' })
    // Fixed coupon capped at the subtotal.
    await applyCoupon(owner, 'LANCAMENTO')
    expect(await quote(owner)).toMatchObject({ discount: '0.3', total: '0.016' })
  })

  it('sums line totals exactly and rounds percent discounts without float artefacts', async () => {
    await add(owner, 'nft_001', 'nft_001-1of50', 2)
    await add(owner, 'nft_001', 'nft_001-open', 6)
    const result = await quote(owner)
    expect(result.lines.map((line) => line.lineTotal)).toEqual(['2.38', '7.14'])
    expect(result).toMatchObject({ subtotal: '9.52', total: '9.536', cartVersion: 2 })
    // Percent discount rounded half-up at 18 dp, never a float artefact.
    await applyCoupon(owner, 'KURIO10')
    expect((await quote(owner)).discount).toBe('0.952')
  })

  it('an empty cart is not purchasable', async () => {
    expect(await quote(owner)).toMatchObject({ lines: [], subtotal: '0', purchasable: false })
  })

  it('reports changes against previousQuoteId and availability problems', async () => {
    await add(owner, 'nft_001', 'nft_001-1of50', 3)
    const first = await quote(owner)
    patchNft('nft_001', { price: '1.29', editions: [{ id: 'nft_001-1of50', available: 2 }] })
    const second = await quote(owner, first.quoteId)
    expect(second.changes).toEqual([
      { type: 'price_changed', nftId: 'nft_001', editionId: 'nft_001-1of50', previousUnitPrice: '1.19', unitPrice: '1.29' },
      { type: 'availability_changed', nftId: 'nft_001', editionId: 'nft_001-1of50', requested: 3, available: 2 },
    ])
    expect(second).toMatchObject({ purchasable: false, subtotal: '3.87' })
    // The cart shows the reduced bound so the user can fix the line.
    expect((await getCart(owner)).items[0]?.nft.maxQuantity).toBe(2)

    patchNft('nft_001', { editions: [{ id: 'nft_001-1of50', available: 0 }] })
    expect((await quote(owner, second.quoteId)).changes).toEqual([
      { type: 'item_unavailable', nftId: 'nft_001', editionId: 'nft_001-1of50' },
    ])
  })

  it('previousQuoteId must exist and belong to the same owner (404 QUOTE_NOT_FOUND)', async () => {
    const mine = await quote(owner)
    const unknown = await capture(quote(owner, 'qt_unknown'))
    expect([unknown.status, unknown.code]).toEqual([404, 'QUOTE_NOT_FOUND'])
    const foreign = await capture(quote({ guest: GUEST_B }, mine.quoteId))
    expect(foreign.code).toBe('QUOTE_NOT_FOUND')
  })

  it('drops an invalidated coupon and reports coupon_invalidated', async () => {
    await add(owner, 'nft_001', 'nft_001-1of50', 1)
    // Simulate a stored code that expired after it was applied.
    const stored = getDb().carts[0]!
    stored.coupon = 'EXPIRADO'
    const result = await quote(owner)
    expect(result).toMatchObject({ coupon: null, discount: '0', total: '1.206' })
    expect(result.changes).toEqual([{ type: 'coupon_invalidated', code: 'EXPIRADO', reason: 'expired' }])
  })
})

describe('guest cart merge on login/register (ADR-006)', () => {
  it('sums, caps at min(available, maxPerOrder), drops sold-out lines and deletes the guest cart', async () => {
    // User already has 2 × 1of10 (2 left, max 3) and 4 × 1of50 (10 left, max 5).
    const { session } = await login()
    const user = { token: session.token }
    await add(user, 'nft_001', 'nft_001-1of10', 1)
    await add(user, 'nft_001', 'nft_001-1of50', 4)
    await applyCoupon(user, 'LANCAMENTO')

    const guest = { guest: GUEST_A }
    await add(guest, 'nft_001', 'nft_001-1of10', 2)
    await add(guest, 'nft_001', 'nft_001-1of50', 3)
    await add(guest, 'nft_002', 'nft_002-open', 2)
    await add(guest, 'nft_001', 'nft_001-1of1', 1)
    await applyCoupon(guest, 'KURIO10')
    patchNft('nft_001', { editions: [{ id: 'nft_001-1of1', available: 0 }] })

    const response = await login(GUEST_A)
    expect(response.cartMerge).toEqual({
      mergedItems: 3,
      adjustments: [
        { nftId: 'nft_001', editionId: 'nft_001-1of10', requested: 3, applied: 2, reason: 'availability' },
        { nftId: 'nft_001', editionId: 'nft_001-1of50', requested: 7, applied: 5, reason: 'max_per_order' },
        { nftId: 'nft_001', editionId: 'nft_001-1of1', requested: 1, applied: 0, reason: 'unavailable' },
      ],
    })
    const merged = await getCart({ token: response.session.token })
    expect(merged.items.map((item) => [item.editionId, item.quantity])).toEqual([
      ['nft_001-1of10', 2],
      ['nft_001-1of50', 5],
      ['nft_002-open', 2],
    ])
    // The user's coupon wins.
    expect(merged.coupon?.code).toBe('LANCAMENTO')
    // Guest cart deleted.
    expect(getDb().carts.some((cart) => cart.owner.kind === 'guest')).toBe(false)
    expect((await getCart(guest)).items).toEqual([])
  })

  it('keeps the guest coupon when the user has none; register merges too', async () => {
    await add({ guest: GUEST_A }, 'nft_001', 'nft_001-1of50', 1)
    await applyCoupon({ guest: GUEST_A }, 'KURIO10')
    const response = await client.post<unknown>(
      '/auth/register',
      { username: 'nova.compra', email: 'nova.compra@kurio.test', password: 'Segredo2026', guestCartId: GUEST_A },
      { skipAuth: true },
    )
    const body = authResponseSchema.parse(response.data)
    expect(body.cartMerge).toEqual({ mergedItems: 1, adjustments: [] })
    const cart = await getCart({ token: body.session.token })
    expect(cart).toMatchObject({ owner: 'user', itemCount: 1, coupon: { code: 'KURIO10' } })
  })

  it('returns null for an unknown/empty guest cart; a failed login leaves the guest cart untouched', async () => {
    expect((await login(GUEST_B)).cartMerge).toBeNull()
    await add({ guest: GUEST_A }, 'nft_001', 'nft_001-1of50', 1)
    const failed = await capture(
      client.post('/auth/login', { ...DEMO_CREDENTIALS.collector, password: 'wrong-password', guestCartId: GUEST_A }, { skipAuth: true }),
    )
    expect(failed.code).toBe('INVALID_CREDENTIALS')
    expect((await getCart({ guest: GUEST_A })).itemCount).toBe(1)
  })

  it('reset clears every cart and quote', async () => {
    await add({ guest: GUEST_A }, 'nft_001', 'nft_001-1of50', 1)
    await quote({ guest: GUEST_A })
    resetDb()
    expect(getDb().carts).toEqual([])
    expect(getDb().quotes).toEqual([])
  })
})
