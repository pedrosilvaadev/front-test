import { http, HttpResponse, type DefaultBodyType } from 'msw'
import type { ErrorEnvelope } from '@/api/errors'
import {
  createOrderRequestSchema,
  idempotencyKeySchema,
  orderListQuerySchema,
  toFieldErrorsDetails,
  type Order,
  type OrderList,
} from '@/contracts'
import { getDb, updateDb } from '../db'
import { apiPath, errorResponse } from '../http'
import { createOrder, getOrder, listOrders } from '../order-store'
import { invalidJson, readJsonBody } from './cart'
import { requireUser } from './wallets'

const MESSAGES: Record<string, string> = {
  IDEMPOTENCY_CONFLICT: 'This Idempotency-Key was used with a different payload.',
  QUOTE_EXPIRED: 'The quote expired. Request a new quote.',
  QUOTE_CHANGED: 'Prices changed. Review and confirm again.',
  AVAILABILITY_CONFLICT: 'Some items are no longer available in the quoted quantity.',
  WALLET_NETWORK_MISMATCH: 'Order, quote and wallet networks must match.',
  WALLET_NOT_CONNECTED: 'Connect the wallet before paying.',
  QUOTE_NOT_FOUND: 'Quote not found.',
  WALLET_NOT_FOUND: 'Wallet not found.',
}

/** Orders (docs/API_CONTRACTS.md "Orders"); creation is idempotent per user + `Idempotency-Key`. */
export const orderHandlers = [
  http.post<never, DefaultBodyType, Order | ErrorEnvelope>(apiPath('/orders'), async ({ request }) => {
    const user = await requireUser(request)
    if (!user.ok) return user.response
    const key = idempotencyKeySchema.safeParse(request.headers.get('idempotency-key') ?? '')
    if (!key.success) return errorResponse(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Send an Idempotency-Key (UUID) header.')
    const json = await readJsonBody(request)
    if (!json.ok) return invalidJson()
    const parsed = createOrderRequestSchema.safeParse(json.body)
    if (!parsed.success) {
      return errorResponse(422, 'VALIDATION_ERROR', 'Invalid order.', toFieldErrorsDetails(parsed.error))
    }
    const result = createOrder(user.userId, key.data.toLowerCase(), parsed.data)
    if (!result.ok) {
      if (result.code === 'EMPTY_QUOTE') {
        return errorResponse(422, 'VALIDATION_ERROR', 'The quoted cart is empty.', {
          fieldErrors: {},
          formErrors: ['The quoted cart is empty.'],
        })
      }
      const details = 'details' in result ? result.details : undefined
      return errorResponse(result.status, result.code, MESSAGES[result.code] ?? result.code, details)
    }
    // Dev control: the order is committed but the response is lost (network error).
    if (getDb().checkoutControls.dropNextOrderResponses > 0) {
      updateDb((state) => {
        state.checkoutControls.dropNextOrderResponses -= 1
      })
      return HttpResponse.error()
    }
    if (result.replayed) {
      return HttpResponse.json<Order>(result.order, { status: 200, headers: { 'Idempotent-Replayed': 'true' } })
    }
    return HttpResponse.json<Order>(result.order, { status: 201 })
  }),

  http.get<never, DefaultBodyType, OrderList | ErrorEnvelope>(apiPath('/orders'), async ({ request }) => {
    const user = await requireUser(request)
    if (!user.ok) return user.response
    const status = new URL(request.url).searchParams.get('status')
    const parsed = orderListQuerySchema.safeParse(status === null ? {} : { status })
    if (!parsed.success) {
      return errorResponse(400, 'INVALID_QUERY', 'Invalid order query.', toFieldErrorsDetails(parsed.error))
    }
    return HttpResponse.json<OrderList>({ items: listOrders(user.userId, parsed.data.status) })
  }),

  http.get<{ orderId: string }, DefaultBodyType, Order | ErrorEnvelope>(apiPath('/orders/:orderId'), async ({ request, params }) => {
    const user = await requireUser(request)
    if (!user.ok) return user.response
    const result = getOrder(user.userId, params.orderId)
    if (result.ok) return HttpResponse.json<Order>(result.order)
    return result.code === 'FORBIDDEN'
      ? errorResponse(403, 'FORBIDDEN', 'This order belongs to another user.')
      : errorResponse(404, 'ORDER_NOT_FOUND', 'Order not found.')
  }),
]
