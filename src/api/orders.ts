import { orderListSchema, orderSchema, type CreateOrderRequest, type Order, type OrderList, type OrderStatus } from '@/contracts'
import { apiClient } from './client'
import type { RequestOptions } from './nfts'

/**
 * Orders API (docs/API_CONTRACTS.md "Orders"). Transport only; the bearer
 * token comes from the session bridge. Creation needs the caller's
 * persisted `Idempotency-Key` (ADR-004): the same key + payload is replayed
 * on retries and always resolves to the same order.
 */
export interface CreateOrderResult {
  order: Order
  /** `Idempotent-Replayed: true` (200): the order already existed for this key. */
  replayed: boolean
}

/** `POST /api/orders` → 201 new order, 200 replay. */
export async function createOrder(body: CreateOrderRequest, idempotencyKey: string): Promise<CreateOrderResult> {
  const response = await apiClient.post<unknown>('/orders', body, { headers: { 'Idempotency-Key': idempotencyKey } })
  return {
    order: orderSchema.parse(response.data),
    replayed: response.status === 200 || String(response.headers['idempotent-replayed']) === 'true',
  }
}

/** `GET /api/orders/:orderId`; 404 `ORDER_NOT_FOUND`, 403 `FORBIDDEN`. */
export async function getOrder(orderId: string, { signal }: RequestOptions = {}): Promise<Order> {
  const { data } = await apiClient.get<unknown>(`/orders/${encodeURIComponent(orderId)}`, { signal })
  return orderSchema.parse(data)
}

/** `GET /api/orders?status=` (newest first). */
export async function listOrders(status?: OrderStatus, { signal }: RequestOptions = {}): Promise<OrderList> {
  const { data } = await apiClient.get<unknown>('/orders', { signal, params: status ? { status } : undefined })
  return orderListSchema.parse(data)
}
