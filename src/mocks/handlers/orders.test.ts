import { afterEach, describe, expect, it } from 'vitest'
import { createApiClient } from '@/api/client'
import { isApiError, type ApiError } from '@/api/errors'
import { authResponseSchema, orderListSchema, orderSchema, quoteSchema, type Order, type Quote } from '@/contracts'
import { patchNft } from '../catalog'
import { findNft, getDb, initDb, resetDb, updateDb } from '../db'
import { DEMO_CREDENTIALS } from '../fixtures/users'
import { canonicalJson } from '../order-store'

/**
 * P4-02 orders mock (docs/API_CONTRACTS.md "Orders"): idempotency, quote
 * revalidation, wallet rules, deterministic resolution, stock/cart effects
 * and immutable receipts. The collector (usr_001) has a seeded primary
 * Ethereum wallet (disconnected) and a secondary Polygon wallet.
 */
const client = createApiClient({ baseURL: '/api', timeoutMs: 5000 })
const KEY_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const KEY_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const BUYER = {
  displayName: 'Kurio Collector',
  username: 'kurio.collector',
  profileName: 'Kurio Collector',
  email: 'colecionador@kurio.test',
  ensName: 'kurio-collector.eth',
  referralCode: 'KURIO2026',
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

async function setup(quantity = 2) {
  const login = authResponseSchema.parse((await client.post<unknown>('/auth/login', DEMO_CREDENTIALS.collector, { skipAuth: true })).data)
  const auth = { skipAuth: true, headers: { Authorization: `Bearer ${login.session.token}` } }
  await client.post('/cart/items', { nftId: 'nft_001', editionId: 'nft_001-1of50', quantity }, auth)
  const quote = quoteSchema.parse((await client.post<unknown>('/quotes', { network: 'ethereum' }, auth)).data)
  await client.post('/wallets/primary/connection', { network: 'ethereum' }, auth)
  const body = { quoteId: quote.quoteId, network: 'ethereum', walletId: 'wal_usr_001_primary', buyer: BUYER }
  const post = (key: string, payload: unknown = body) =>
    client.post<unknown>('/orders', payload, { ...auth, headers: { ...auth.headers, 'Idempotency-Key': key } })
  const get = async (orderId: string): Promise<Order> => orderSchema.parse((await client.get<unknown>(`/orders/${orderId}`, auth)).data)
  return { auth, quote, body, post, get, token: login.session.token }
}

function makeDue() {
  updateDb((state) => {
    for (const record of state.orders) record.resolveAt = new Date(Date.now() - 1).toISOString()
  })
}

afterEach(() => {
  initDb(undefined)
  resetDb()
})

describe('POST /api/orders idempotency', () => {
  it('creates a pending order (201) and replays it for the same key + payload (200, no duplicate)', async () => {
    const { post, quote } = await setup()
    const first = await post(KEY_A)
    expect(first.status).toBe(201)
    const order = orderSchema.parse(first.data)
    expect(order).toMatchObject({ status: 'pending', transaction: null, decline: null, quoteId: quote.quoteId, idempotencyKey: KEY_A })
    expect(order.receipt).toMatchObject({ subtotal: '2.38', discount: '0', networkFee: '0.016', total: '2.396' })
    // Stock reserved at creation.
    expect(findNft('nft_001')?.editions.find((e) => e.id === 'nft_001-1of50')?.available).toBe(8)

    const replay = await post(KEY_A)
    expect(replay.status).toBe(200)
    expect(replay.headers['idempotent-replayed']).toBe('true')
    expect(orderSchema.parse(replay.data).id).toBe(order.id)
    expect(getDb().orders).toHaveLength(1)
    expect(findNft('nft_001')?.editions.find((e) => e.id === 'nft_001-1of50')?.available).toBe(8)
  })

  it('same key + different payload → 409 IDEMPOTENCY_CONFLICT; missing key → 400', async () => {
    const { post, body, auth } = await setup()
    await post(KEY_A)
    const conflict = await capture(post(KEY_A, { ...body, note: 'outra' }))
    expect([conflict.status, conflict.code]).toEqual([409, 'IDEMPOTENCY_CONFLICT'])
    const missing = await capture(client.post('/orders', body, auth))
    expect([missing.status, missing.code]).toEqual([400, 'IDEMPOTENCY_KEY_REQUIRED'])
    expect(getDb().orders).toHaveLength(1)
  })

  it('replay still returns the order after the quote expired or prices changed (keys checked first)', async () => {
    const { post } = await setup()
    const created = orderSchema.parse((await post(KEY_A)).data)
    patchNft('nft_001', { price: '9.99' })
    updateDb((state) => {
      for (const record of state.quotes) record.quote.expiresAt = new Date(Date.now() - 1).toISOString()
    })
    const replay = await post(KEY_A)
    expect(orderSchema.parse(replay.data).id).toBe(created.id)
  })

  it('canonical fingerprint ignores key order', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe(canonicalJson({ a: { c: 3, d: 2 }, b: 1 }))
  })
})

describe('POST /api/orders revalidation', () => {
  it('QUOTE_CHANGED with a fresh quote when the price changed', async () => {
    const { post } = await setup()
    patchNft('nft_001', { price: '1.29' })
    const error = await capture(post(KEY_A))
    expect([error.status, error.code]).toEqual([409, 'QUOTE_CHANGED'])
    const details = error.details as { changes: unknown[]; quote: Quote }
    expect(details.changes).toEqual([
      { type: 'price_changed', nftId: 'nft_001', editionId: 'nft_001-1of50', previousUnitPrice: '1.19', unitPrice: '1.29' },
    ])
    expect(quoteSchema.parse(details.quote).total).toBe('2.596')
    expect(getDb().orders).toHaveLength(0)
  })

  it('AVAILABILITY_CONFLICT, QUOTE_EXPIRED, wallet rules and unknown quote', async () => {
    const { post, body, auth } = await setup()
    expect((await capture(post(KEY_A, { ...body, quoteId: 'qt_nope' }))).code).toBe('QUOTE_NOT_FOUND')
    expect((await capture(post(KEY_A, { ...body, walletId: 'wal_nope' }))).code).toBe('WALLET_NOT_FOUND')
    expect((await capture(post(KEY_A, { ...body, walletId: 'wal_usr_001_secondary' }))).code).toBe('WALLET_NETWORK_MISMATCH')
    await client.delete('/wallets/primary/connection', auth)
    expect((await capture(post(KEY_A))).code).toBe('WALLET_NOT_CONNECTED')
    await client.post('/wallets/primary/connection', { network: 'ethereum' }, auth)

    patchNft('nft_001', { editions: [{ id: 'nft_001-1of50', available: 1 }] })
    const conflict = await capture(post(KEY_A))
    expect(conflict.code).toBe('AVAILABILITY_CONFLICT')
    expect((conflict.details as { changes: unknown[] }).changes).toEqual([
      { type: 'availability_changed', nftId: 'nft_001', editionId: 'nft_001-1of50', requested: 2, available: 1 },
    ])
    patchNft('nft_001', { editions: [{ id: 'nft_001-1of50', available: 10 }] })
    updateDb((state) => {
      for (const record of state.quotes) record.quote.expiresAt = new Date(Date.now() - 1).toISOString()
    })
    expect((await capture(post(KEY_B))).code).toBe('QUOTE_EXPIRED')
  })
})

describe('POST /api/orders: one order per quote and per cart version', () => {
  it('another key with an already used quote → 409 QUOTE_EXPIRED (no second order)', async () => {
    const { post } = await setup()
    expect((await post(KEY_A)).status).toBe(201)
    const error = await capture(post(KEY_B))
    expect(error).toMatchObject({ status: 409, code: 'QUOTE_EXPIRED' })
    expect(getDb().orders).toHaveLength(1)
  })

  it('a quote for an older cart version → 409 QUOTE_CHANGED with a fresh quote of the current cart', async () => {
    const { post, auth } = await setup()
    await client.post('/cart/items', { nftId: 'nft_001', editionId: 'nft_001-1of50', quantity: 1 }, auth)
    const error = await capture(post(KEY_A))
    expect(error).toMatchObject({ status: 409, code: 'QUOTE_CHANGED' })
    const fresh = quoteSchema.parse((error.details as { quote: unknown }).quote)
    expect(fresh.lines[0]?.quantity).toBe(3)
    expect(getDb().orders).toHaveLength(0)
  })
})

describe('order lifecycle', () => {
  it('confirms deterministically: transaction, cart lines removed, stock committed, immutable receipt', async () => {
    const { post, get, auth } = await setup(2)
    // One extra unit stays in the cart after the quote (only the quoted quantity is bought).
    const created = orderSchema.parse((await post(KEY_A)).data)
    await client.post('/cart/items', { nftId: 'nft_001', editionId: 'nft_001-open', quantity: 1 }, auth)
    const cartBefore = (await client.get<{ version: number }>('/cart', auth)).data
    makeDue()
    const confirmed = await get(created.id)
    expect(confirmed.status).toBe('confirmed')
    if (confirmed.status !== 'confirmed') throw new Error('expected confirmed')
    expect(confirmed.transaction.hash).toMatch(/^0x[0-9a-f]{64}$/)
    expect(confirmed.transaction.explorerUrl).toBe(`https://etherscan.io/tx/${confirmed.transaction.hash}`)
    expect(confirmed.version).toBe(2)
    const cart = (await client.get<{ version: number; items: { editionId: string }[] }>('/cart', auth)).data
    expect(cart.items.map((item) => item.editionId)).toEqual(['nft_001-open'])
    expect(cart.version).toBe(cartBefore.version + 1)
    expect(findNft('nft_001')?.editions.find((e) => e.id === 'nft_001-1of50')?.available).toBe(8)

    // Later catalog changes never alter the receipt.
    patchNft('nft_001', { price: '5' })
    const again = await get(created.id)
    expect(again.receipt).toEqual(created.receipt)
    expect(again.receipt.lines[0]).toMatchObject({ name: 'Emerald Ape #042', unitPrice: '1.19', quantity: 2, lineTotal: '2.38' })

    const pending = orderListSchema.parse((await client.get<unknown>('/orders?status=pending', auth)).data)
    expect(pending.items).toEqual([])
    const all = orderListSchema.parse((await client.get<unknown>('/orders', auth)).data)
    expect(all.items.map((order) => order.id)).toEqual([created.id])
    expect((await capture(client.get('/orders?status=nope', auth))).code).toBe('INVALID_QUERY')
  })

  it('declines via the dev control, releasing stock and keeping the cart', async () => {
    const { post, get, auth } = await setup(2)
    await client.put('/__dev/checkout', { orderOutcome: 'decline' }, { skipAuth: true })
    const created = orderSchema.parse((await post(KEY_A)).data)
    makeDue()
    const declined = await get(created.id)
    expect(declined).toMatchObject({ status: 'declined', transaction: null, decline: { reason: 'PAYMENT_DECLINED' } })
    expect(findNft('nft_001')?.editions.find((e) => e.id === 'nft_001-1of50')?.available).toBe(10)
    const cart = (await client.get<{ itemCount: number }>('/cart', auth)).data
    expect(cart.itemCount).toBe(2)
  })

  it('stays pending with orderOutcome=pending until forced; other users get 403', async () => {
    const { post, get } = await setup(1)
    await client.put('/__dev/checkout', { orderOutcome: 'pending' }, { skipAuth: true })
    const created = orderSchema.parse((await post(KEY_A)).data)
    expect((await get(created.id)).status).toBe('pending')
    const forced = orderSchema.parse((await client.post<unknown>(`/__dev/orders/${created.id}/resolve`, { status: 'confirmed' }, { skipAuth: true })).data)
    expect(forced.status).toBe('confirmed')

    const other = authResponseSchema.parse((await client.post<unknown>('/auth/login', DEMO_CREDENTIALS.creator, { skipAuth: true })).data)
    const forbidden = await capture(
      client.get(`/orders/${created.id}`, { skipAuth: true, headers: { Authorization: `Bearer ${other.session.token}` } }),
    )
    expect([forbidden.status, forbidden.code]).toEqual([403, 'FORBIDDEN'])
  })

  it('wallet connection can be rejected via the dev control', async () => {
    const { auth } = await setup(1)
    await client.put('/__dev/checkout', { walletConnect: 'reject' }, { skipAuth: true })
    const rejected = await capture(client.post('/wallets/secondary/connection', { network: 'polygon' }, auth))
    expect(rejected.code).toBe('WALLET_CONNECTION_REJECTED')
    const mismatch = await capture(client.post('/wallets/secondary/connection', { network: 'ethereum' }, auth))
    expect(mismatch.code).toBe('WALLET_NETWORK_MISMATCH')
  })
})
