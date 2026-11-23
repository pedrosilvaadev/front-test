import { z } from 'zod'
import {
  ethAmountSchema,
  idSchema,
  imageSchema,
  isoDateTimeSchema,
  networkSchema,
  percentSchema,
  quantitySchema,
  versionSchema,
} from './common/primitives'

/**
 * Cart (README §3 "Carrinho"; §5 "Carrinho"). Server-side cart owned either
 * by the authenticated user (Bearer) or by a guest (`X-Guest-Cart-Id`), see
 * ADR-006. Lines are unique per (nftId, editionId). Money totals are NOT part
 * of the cart: the quote (`POST /api/quotes`) is the single source of
 * subtotal/discount/fee/total (README: "A cotação da API é a referência").
 */

/** Coupon as applied to a cart. Validity is re-checked by every quote. */
export const appliedCouponSchema = z.discriminatedUnion('kind', [
  z.object({ code: z.string().min(1), kind: z.literal('percent'), percent: percentSchema, label: z.string() }),
  z.object({ code: z.string().min(1), kind: z.literal('fixed'), amount: ethAmountSchema, label: z.string() }),
])
export type AppliedCoupon = z.infer<typeof appliedCouponSchema>

export const cartItemSchema = z.object({
  /** Opaque line id (stable for the same nftId+editionId). */
  id: idSchema,
  nftId: idSchema,
  editionId: idSchema,
  quantity: quantitySchema,
  /** Snapshot of catalog fields needed to render the line. */
  nft: z.object({
    slug: z.string().min(1),
    name: z.string().min(1),
    tokenId: z.string().min(1),
    network: networkSchema,
    image: imageSchema,
    editionLabel: z.string().min(1),
    /** Current catalog unit price (may differ from a previous quote). */
    unitPrice: ethAmountSchema,
    /** Remaining stock of the edition right now. */
    available: z.int().min(0),
    /** min(available, edition.maxPerOrder): upper bound for the quantity stepper. */
    maxQuantity: z.int().min(0),
    /** Catalog version the snapshot was built from (stale-event guard). */
    version: versionSchema,
  }),
})
export type CartItem = z.infer<typeof cartItemSchema>

export const cartSchema = z.object({
  id: idSchema,
  owner: z.enum(['user', 'guest']),
  items: z.array(cartItemSchema),
  coupon: appliedCouponSchema.nullable(),
  /** Sum of quantities (header badge). */
  itemCount: z.int().min(0),
  /** Bumped on every cart mutation; quotes reference it. */
  version: versionSchema,
  updatedAt: isoDateTimeSchema,
})
export type Cart = z.infer<typeof cartSchema>

/** `POST /api/cart/items`: adds `quantity` to the existing line or creates it. */
export const addCartItemRequestSchema = z.object({
  nftId: idSchema,
  editionId: idSchema,
  quantity: quantitySchema,
})
export type AddCartItemRequest = z.infer<typeof addCartItemRequestSchema>

/** `PATCH /api/cart/items/:itemId`: sets the absolute quantity (use DELETE to remove). */
export const updateCartItemRequestSchema = z.object({ quantity: quantitySchema })
export type UpdateCartItemRequest = z.infer<typeof updateCartItemRequestSchema>

/** `PUT /api/cart/coupon`. Codes are case-insensitive, normalized to upper case. */
export const applyCouponRequestSchema = z.object({
  code: z.string().trim().toUpperCase().min(1).max(32),
})
export type ApplyCouponRequest = z.infer<typeof applyCouponRequestSchema>

/** `details` of 409 AVAILABILITY_CONFLICT on cart mutations. */
export const availabilityConflictDetailsSchema = z.object({
  nftId: idSchema,
  editionId: idSchema,
  requested: z.int().min(0),
  available: z.int().min(0),
  maxQuantity: z.int().min(0),
})
export type AvailabilityConflictDetails = z.infer<typeof availabilityConflictDetailsSchema>

/** Result of merging the guest cart at login/register (ADR-006). */
export const cartMergeResultSchema = z.object({
  /** Lines from the guest cart that ended up in the user cart. */
  mergedItems: z.int().min(0),
  /** Lines whose quantity was reduced or dropped while merging. */
  adjustments: z.array(
    z.object({
      nftId: idSchema,
      editionId: idSchema,
      requested: z.int().min(0),
      applied: z.int().min(0),
      reason: z.enum(['availability', 'max_per_order', 'unavailable']),
    }),
  ),
})
export type CartMergeResult = z.infer<typeof cartMergeResultSchema>
