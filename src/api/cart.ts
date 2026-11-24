import type { AxiosRequestConfig } from 'axios'
import {
  cartSchema,
  type AddCartItemRequest,
  type ApplyCouponRequest,
  type Cart,
  type UpdateCartItemRequest,
} from '@/contracts'
import { apiClient } from './client'
import type { RequestOptions } from './nfts'

/**
 * Cart API (docs/API_CONTRACTS.md "Cart"). Transport only. The owner is
 * explicit on every call so a request can never be sent for a different
 * owner than the cache entry it fills (ADR-004):
 *  - `user`: the bearer token is sent as given (a 401 still reaches the
 *    session bridge, which ignores tokens that are no longer current);
 *  - `guest`: `X-Guest-Cart-Id` only and `skipAuth`, so a token that appeared
 *    meanwhile is never attached (the bearer would win server side and the
 *    user's cart would land in the guest cache entry).
 */
export type CartRequestOwner = { kind: 'user'; token: string } | { kind: 'guest'; guestCartId: string }

export const GUEST_CART_HEADER = 'X-Guest-Cart-Id'

export function ownerConfig(owner: CartRequestOwner, { signal }: RequestOptions = {}): AxiosRequestConfig {
  if (owner.kind === 'user') return { signal, headers: { Authorization: `Bearer ${owner.token}` } }
  return { signal, skipAuth: true, headers: { [GUEST_CART_HEADER]: owner.guestCartId } }
}

/** `GET /api/cart` → 200 `Cart` (empty cart when none exists yet). */
export async function getCart(owner: CartRequestOwner, options?: RequestOptions): Promise<Cart> {
  const { data } = await apiClient.get<unknown>('/cart', ownerConfig(owner, options))
  return cartSchema.parse(data)
}

/** `POST /api/cart/items` (adds to an existing line); 409 `AVAILABILITY_CONFLICT`. */
export async function addCartItem(owner: CartRequestOwner, body: AddCartItemRequest): Promise<Cart> {
  const { data } = await apiClient.post<unknown>('/cart/items', body, ownerConfig(owner))
  return cartSchema.parse(data)
}

/** `PATCH /api/cart/items/:itemId` (absolute quantity); 409 `AVAILABILITY_CONFLICT`. */
export async function updateCartItem(owner: CartRequestOwner, itemId: string, body: UpdateCartItemRequest): Promise<Cart> {
  const { data } = await apiClient.patch<unknown>(`/cart/items/${encodeURIComponent(itemId)}`, body, ownerConfig(owner))
  return cartSchema.parse(data)
}

/** `DELETE /api/cart/items/:itemId` (idempotent). */
export async function removeCartItem(owner: CartRequestOwner, itemId: string): Promise<Cart> {
  const { data } = await apiClient.delete<unknown>(`/cart/items/${encodeURIComponent(itemId)}`, ownerConfig(owner))
  return cartSchema.parse(data)
}

/** `PUT /api/cart/coupon`; 422 `COUPON_INVALID` / `COUPON_EXPIRED`. */
export async function applyCartCoupon(owner: CartRequestOwner, body: ApplyCouponRequest): Promise<Cart> {
  const { data } = await apiClient.put<unknown>('/cart/coupon', body, ownerConfig(owner))
  return cartSchema.parse(data)
}

/** `DELETE /api/cart/coupon`. */
export async function removeCartCoupon(owner: CartRequestOwner): Promise<Cart> {
  const { data } = await apiClient.delete<unknown>('/cart/coupon', ownerConfig(owner))
  return cartSchema.parse(data)
}
