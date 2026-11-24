import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/errors'
import type { CreateOrderRequest, Order } from '@/contracts'
import {
  clearCheckoutStateForUser,
  clearCheckoutStateOnLogout,
  readAttempt,
  readDraft,
  writeAttempt,
  writeDraft,
} from './checkout-storage'
import { placeOrder, type OrdersApi } from './place-order'

const USER = 'usr_001'
const PAYLOAD: CreateOrderRequest = {
  quoteId: 'qt_1',
  network: 'ethereum',
  walletId: 'wal_1',
  buyer: {
    displayName: 'Kurio Collector',
    username: 'kurio.collector',
    profileName: 'Kurio Collector',
    email: 'colecionador@kurio.test',
    ensName: 'kurio-collector.eth',
    referralCode: 'KURIO2026',
  },
}

function order(id: string, status: Order['status'] = 'pending'): Order {
  return { id, status } as unknown as Order
}

function apiWith(overrides: Partial<OrdersApi> = {}): OrdersApi & { createOrder: ReturnType<typeof vi.fn> } {
  return {
    createOrder: vi.fn(async () => ({ order: order('ord_1'), replayed: false })),
    getOrder: vi.fn(async (id: string) => order(id)),
    ...overrides,
  } as OrdersApi & { createOrder: ReturnType<typeof vi.fn> }
}

afterEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()
})

describe('placeOrder (ADR-004 attempts)', () => {
  it('persists the attempt BEFORE sending and stores the order id afterwards', async () => {
    let seenAtSend: unknown
    const api = apiWith({
      createOrder: vi.fn(async (_body, key) => {
        seenAtSend = readAttempt(USER)
        expect(key).toBe('key-1')
        return { order: order('ord_1'), replayed: false }
      }),
    })
    await placeOrder(USER, PAYLOAD, { api, newKey: () => 'key-1' })
    expect(seenAtSend).toMatchObject({ userId: USER, quoteId: 'qt_1', idempotencyKey: 'key-1', payload: PAYLOAD })
    expect(readAttempt(USER)?.orderId).toBe('ord_1')
  })

  it('a network error keeps the attempt; the retry reuses the same key + payload', async () => {
    const createOrder = vi
      .fn()
      .mockRejectedValueOnce(new ApiError({ kind: 'network' }))
      .mockResolvedValueOnce({ order: order('ord_1'), replayed: true })
    const api = apiWith({ createOrder })
    let keys = 0
    const newKey = () => `key-${String((keys += 1))}`
    await expect(placeOrder(USER, PAYLOAD, { api, newKey })).rejects.toBeInstanceOf(ApiError)
    expect(readAttempt(USER)?.idempotencyKey).toBe('key-1')
    const result = await placeOrder(USER, PAYLOAD, { api, newKey })
    expect(result.id).toBe('ord_1')
    expect(createOrder.mock.calls.map((call) => call[1])).toEqual(['key-1', 'key-1'])
    expect(keys).toBe(1)
  })

  it('a revalidation rejection clears the attempt (next confirmation gets a new key)', async () => {
    const createOrder = vi.fn().mockRejectedValueOnce(new ApiError({ kind: 'conflict', status: 409, code: 'QUOTE_CHANGED' }))
    await expect(placeOrder(USER, PAYLOAD, { api: apiWith({ createOrder }), newKey: () => 'key-1' })).rejects.toThrow()
    expect(readAttempt(USER)).toBeNull()
  })

  it('a previous pending order is returned instead of creating a second one', async () => {
    writeAttempt({ userId: USER, quoteId: 'qt_0', idempotencyKey: 'old', payload: { ...PAYLOAD, quoteId: 'qt_0' }, orderId: 'ord_0' })
    const api = apiWith()
    const result = await placeOrder(USER, PAYLOAD, { api, newKey: () => 'new' })
    expect(result.id).toBe('ord_0')
    expect(api.createOrder).not.toHaveBeenCalled()
  })

  it('a previous attempt without order id is replayed first; a terminal one is cleared before a new key', async () => {
    writeAttempt({ userId: USER, quoteId: 'qt_0', idempotencyKey: 'old', payload: { ...PAYLOAD, quoteId: 'qt_0' } })
    const createOrder = vi
      .fn()
      .mockResolvedValueOnce({ order: order('ord_0', 'declined'), replayed: true })
      .mockResolvedValueOnce({ order: order('ord_1'), replayed: false })
    const result = await placeOrder(USER, PAYLOAD, { api: apiWith({ createOrder }), newKey: () => 'new' })
    expect(createOrder.mock.calls.map((call) => call[1])).toEqual(['old', 'new'])
    expect(result.id).toBe('ord_1')
  })
})

describe('checkout storage clearing rules', () => {
  it('logout clears the user attempt and draft; sign-in as another user clears foreign state only', () => {
    writeAttempt({ userId: USER, quoteId: 'q', idempotencyKey: 'k', payload: PAYLOAD })
    writeAttempt({ userId: 'usr_002', quoteId: 'q', idempotencyKey: 'k', payload: PAYLOAD })
    writeDraft(USER, { a: 1 })
    clearCheckoutStateForUser(USER)
    expect(readAttempt(USER)).not.toBeNull()
    expect(readAttempt('usr_002')).toBeNull()
    expect(readDraft(USER)).toEqual({ a: 1 })
    clearCheckoutStateForUser('usr_002')
    expect(readAttempt(USER)).toBeNull()
    expect(readDraft(USER)).toBeNull()

    writeAttempt({ userId: USER, quoteId: 'q', idempotencyKey: 'k', payload: PAYLOAD })
    writeDraft(USER, { a: 1 })
    clearCheckoutStateOnLogout(USER)
    expect(readAttempt(USER)).toBeNull()
    expect(readDraft(USER)).toBeNull()
  })
})
