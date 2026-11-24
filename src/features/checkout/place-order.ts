import { isApiError } from '@/api/errors'
import type { CreateOrderRequest, Order } from '@/contracts'
import { clearAttempt, readAttempt, writeAttempt, type CheckoutAttempt } from './checkout-storage'

/**
 * Idempotent order placement (ADR-004; docs/API_CONTRACTS.md "Orders →
 * Idempotency", rules 5–8).
 *
 * 1. A persisted attempt with the same payload is a retry: it is replayed
 *    with the same `Idempotency-Key` (timeout, offline, reload, re-login).
 * 2. A persisted attempt with another payload is resolved first: its order is
 *    read (or the attempt replayed) and a still pending order is returned
 *    instead of creating a second one; a terminal order or an attempt rejected
 *    by revalidation is cleared.
 * 3. Only then a new key is generated and persisted BEFORE the request.
 * Network/timeout errors keep the attempt (the next submit replays it);
 * revalidation errors clear it (a re-confirmed quote is a new attempt).
 */

export interface OrdersApi {
  createOrder: (body: CreateOrderRequest, key: string) => Promise<{ order: Order; replayed: boolean }>
  getOrder: (orderId: string) => Promise<Order>
}

export interface PlaceOrderDeps {
  api: OrdersApi
  newKey?: () => string
}

/** Errors meaning the request was rejected before any order existed: the attempt can be dropped. */
const REJECTED_CODES: ReadonlySet<string> = new Set([
  'QUOTE_NOT_FOUND',
  'QUOTE_EXPIRED',
  'QUOTE_CHANGED',
  'AVAILABILITY_CONFLICT',
  'WALLET_NOT_FOUND',
  'WALLET_NOT_CONNECTED',
  'WALLET_NETWORK_MISMATCH',
  'VALIDATION_ERROR',
  'IDEMPOTENCY_CONFLICT',
])

export function isRejectedBeforeOrder(error: unknown): boolean {
  return isApiError(error) && REJECTED_CODES.has(error.code)
}

function samePayload(a: CreateOrderRequest, b: CreateOrderRequest): boolean {
  const canonical = (value: unknown): string =>
    JSON.stringify(value, (_key, v: unknown) =>
      v && typeof v === 'object' && !Array.isArray(v)
        ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([x], [y]) => (x < y ? -1 : 1)))
        : v,
    )
  return canonical(a) === canonical(b)
}

async function send(attempt: CheckoutAttempt, api: OrdersApi): Promise<Order> {
  try {
    const { order } = await api.createOrder(attempt.payload, attempt.idempotencyKey)
    writeAttempt({ ...attempt, orderId: order.id })
    return order
  } catch (error) {
    if (isRejectedBeforeOrder(error)) clearAttempt(attempt.userId)
    throw error
  }
}

/**
 * Resolves a previous attempt with a different payload. Returns its order
 * when it is still pending (the caller shows it instead of paying again);
 * `null` when the attempt is finished or never produced an order.
 */
async function resolvePrevious(attempt: CheckoutAttempt, api: OrdersApi): Promise<Order | null> {
  let order: Order | null = null
  if (attempt.orderId) {
    try {
      order = await api.getOrder(attempt.orderId)
    } catch (error) {
      if (!(isApiError(error) && (error.code === 'ORDER_NOT_FOUND' || error.code === 'FORBIDDEN'))) throw error
    }
  } else {
    try {
      order = (await api.createOrder(attempt.payload, attempt.idempotencyKey)).order
    } catch (error) {
      if (!isRejectedBeforeOrder(error)) throw error
    }
  }
  if (order?.status === 'pending') {
    writeAttempt({ ...attempt, orderId: order.id })
    return order
  }
  clearAttempt(attempt.userId)
  return null
}

export async function placeOrder(userId: string, payload: CreateOrderRequest, deps: PlaceOrderDeps): Promise<Order> {
  const { api, newKey = () => globalThis.crypto.randomUUID() } = deps
  const previous = readAttempt(userId)
  if (previous && samePayload(previous.payload, payload)) {
    if (previous.orderId) {
      try {
        return await api.getOrder(previous.orderId)
      } catch (error) {
        if (!(isApiError(error) && error.code === 'ORDER_NOT_FOUND')) throw error
      }
    }
    return send(previous, api)
  }
  if (previous) {
    const pending = await resolvePrevious(previous, api)
    if (pending) return pending
  }
  const attempt: CheckoutAttempt = { userId, quoteId: payload.quoteId, idempotencyKey: newKey(), payload }
  writeAttempt(attempt)
  return send(attempt, api)
}
