import { http, HttpResponse, type DefaultBodyType, type PathParams } from 'msw'
import type { ErrorEnvelope } from '@/api/errors'
import {
  addCartItemRequestSchema,
  applyCouponRequestSchema,
  toFieldErrorsDetails,
  updateCartItemRequestSchema,
  type Cart,
} from '@/contracts'
import {
  addItem,
  applyCoupon,
  getCartView,
  removeCoupon,
  removeItem,
  resolveOwner,
  updateItem,
  type CartMutationResult,
  type ResolveOwnerResult,
} from '../cart-store'
import { apiPath, errorResponse } from '../http'

type CartResponse = Cart | ErrorEnvelope

/** Parses a JSON body; `undefined` when malformed. */
export async function readJsonBody(request: Request): Promise<{ ok: true; body: unknown } | { ok: false }> {
  try {
    return { ok: true, body: await request.json() }
  } catch {
    return { ok: false }
  }
}

export const invalidJson = () => errorResponse(400, 'INVALID_JSON', 'Request body must be JSON.')

/** Error response for a failed owner resolution (shared with the quote handler). */
export function ownerError(result: Extract<ResolveOwnerResult, { ok: false }>) {
  switch (result.code) {
    case 'GUEST_CART_ID_REQUIRED':
      return errorResponse(400, 'GUEST_CART_ID_REQUIRED', 'Send a bearer token or a valid X-Guest-Cart-Id header.')
    case 'SESSION_EXPIRED':
      return errorResponse(401, 'SESSION_EXPIRED', 'Session expired. Sign in again.')
    case 'UNAUTHORIZED':
      return errorResponse(401, 'UNAUTHORIZED', 'Authentication required.')
  }
}

function mutationResponse(result: CartMutationResult) {
  if (result.ok) return HttpResponse.json<Cart>(result.cart)
  switch (result.code) {
    case 'NFT_NOT_FOUND':
      return errorResponse(404, 'NFT_NOT_FOUND', 'NFT not found.')
    case 'EDITION_NOT_FOUND':
      return errorResponse(404, 'EDITION_NOT_FOUND', 'Edition not found.')
    case 'CART_ITEM_NOT_FOUND':
      return errorResponse(404, 'CART_ITEM_NOT_FOUND', 'Cart item not found.')
    case 'AVAILABILITY_CONFLICT':
      return errorResponse(409, 'AVAILABILITY_CONFLICT', 'Requested quantity exceeds availability.', result.details)
  }
}

/** Cart endpoints (docs/API_CONTRACTS.md "Cart"); owner = bearer user or `X-Guest-Cart-Id`. */
export const cartHandlers = [
  http.get<PathParams, DefaultBodyType, CartResponse>(apiPath('/cart'), async ({ request }) => {
    const owner = await resolveOwner(request)
    if (!owner.ok) return ownerError(owner)
    return HttpResponse.json<Cart>(getCartView(owner.owner))
  }),

  http.post<PathParams, DefaultBodyType, CartResponse>(apiPath('/cart/items'), async ({ request }) => {
    const owner = await resolveOwner(request)
    if (!owner.ok) return ownerError(owner)
    const json = await readJsonBody(request)
    if (!json.ok) return invalidJson()
    const parsed = addCartItemRequestSchema.safeParse(json.body)
    if (!parsed.success) {
      return errorResponse(422, 'VALIDATION_ERROR', 'Invalid cart item.', toFieldErrorsDetails(parsed.error))
    }
    return mutationResponse(addItem(owner.owner, parsed.data))
  }),

  http.patch<{ itemId: string }, DefaultBodyType, CartResponse>(apiPath('/cart/items/:itemId'), async ({ request, params }) => {
    const owner = await resolveOwner(request)
    if (!owner.ok) return ownerError(owner)
    const json = await readJsonBody(request)
    if (!json.ok) return invalidJson()
    const parsed = updateCartItemRequestSchema.safeParse(json.body)
    if (!parsed.success) {
      return errorResponse(422, 'VALIDATION_ERROR', 'Invalid quantity.', toFieldErrorsDetails(parsed.error))
    }
    return mutationResponse(updateItem(owner.owner, params.itemId, parsed.data.quantity))
  }),

  // Idempotent: removing a missing line answers 200 with the unchanged cart.
  http.delete<{ itemId: string }, DefaultBodyType, CartResponse>(apiPath('/cart/items/:itemId'), async ({ request, params }) => {
    const owner = await resolveOwner(request)
    if (!owner.ok) return ownerError(owner)
    return HttpResponse.json<Cart>(removeItem(owner.owner, params.itemId))
  }),

  http.put<PathParams, DefaultBodyType, CartResponse>(apiPath('/cart/coupon'), async ({ request }) => {
    const owner = await resolveOwner(request)
    if (!owner.ok) return ownerError(owner)
    const json = await readJsonBody(request)
    if (!json.ok) return invalidJson()
    const parsed = applyCouponRequestSchema.safeParse(json.body)
    if (!parsed.success) {
      return errorResponse(422, 'VALIDATION_ERROR', 'Invalid coupon code.', toFieldErrorsDetails(parsed.error))
    }
    const result = applyCoupon(owner.owner, parsed.data.code)
    if (result.ok) return HttpResponse.json<Cart>(result.cart)
    return result.code === 'COUPON_EXPIRED'
      ? errorResponse(422, 'COUPON_EXPIRED', 'Coupon expired.', { fieldErrors: { code: ['Coupon expired.'] } })
      : errorResponse(422, 'COUPON_INVALID', 'Invalid coupon.', { fieldErrors: { code: ['Invalid coupon.'] } })
  }),

  http.delete<PathParams, DefaultBodyType, CartResponse>(apiPath('/cart/coupon'), async ({ request }) => {
    const owner = await resolveOwner(request)
    if (!owner.ok) return ownerError(owner)
    return HttpResponse.json<Cart>(removeCoupon(owner.owner))
  }),
]
