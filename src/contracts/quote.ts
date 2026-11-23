import { z } from 'zod'
import { appliedCouponSchema } from './cart'
import {
  currencySchema,
  ethAmountSchema,
  idSchema,
  imageSchema,
  isoDateTimeSchema,
  networkSchema,
  quantitySchema,
  versionSchema,
} from './common/primitives'

/**
 * Quote (README §3 "Carrinho", "Pagamento"; §5 "Cotação"). A server-computed,
 * short-lived price snapshot of the caller's current cart. It is the only
 * source for subtotal/discount/network fee/total shown in cart and checkout,
 * and the order must reference one (`quoteId`). Quotes have no side effects.
 */

/** One priced line. `lineTotal = unitPrice × quantity` (decimal arithmetic). */
export const quoteLineSchema = z.object({
  cartItemId: idSchema,
  nftId: idSchema,
  editionId: idSchema,
  name: z.string().min(1),
  tokenId: z.string().min(1),
  editionLabel: z.string().min(1),
  image: imageSchema,
  unitPrice: ethAmountSchema,
  quantity: quantitySchema,
  lineTotal: ethAmountSchema,
  available: z.int().min(0),
  nftVersion: versionSchema,
})
export type QuoteLine = z.infer<typeof quoteLineSchema>

/**
 * What changed compared to `previousQuoteId` (on POST /api/quotes) or to the
 * quote referenced by an order (409 QUOTE_CHANGED / AVAILABILITY_CONFLICT).
 * Any change requires explicit user re-confirmation.
 */
export const quoteChangeSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('price_changed'),
    nftId: idSchema,
    editionId: idSchema,
    previousUnitPrice: ethAmountSchema,
    unitPrice: ethAmountSchema,
  }),
  z.object({
    type: z.literal('availability_changed'),
    nftId: idSchema,
    editionId: idSchema,
    requested: z.int().min(0),
    available: z.int().min(0),
  }),
  z.object({ type: z.literal('item_unavailable'), nftId: idSchema, editionId: idSchema }),
  z.object({
    type: z.literal('coupon_invalidated'),
    code: z.string().min(1),
    reason: z.enum(['expired', 'invalid']),
  }),
  z.object({
    type: z.literal('fee_changed'),
    previousNetworkFee: ethAmountSchema,
    networkFee: ethAmountSchema,
  }),
])
export type QuoteChange = z.infer<typeof quoteChangeSchema>

export const quoteSchema = z.object({
  quoteId: idSchema,
  cartVersion: z.int().min(0),
  network: networkSchema,
  currency: currencySchema,
  lines: z.array(quoteLineSchema),
  /** Coupon actually applied; null when absent or invalidated. */
  coupon: appliedCouponSchema.nullable(),
  subtotal: ethAmountSchema,
  discount: ethAmountSchema,
  /** "Taxa de rede" (estimated, simulated per network). */
  networkFee: ethAmountSchema,
  /** max(subtotal - discount, 0) + networkFee. */
  total: ethAmountSchema,
  /** Empty when nothing changed relative to `previousQuoteId`. */
  changes: z.array(quoteChangeSchema),
  /** False when any line exceeds availability or the cart is empty. */
  purchasable: z.boolean(),
  issuedAt: isoDateTimeSchema,
  expiresAt: isoDateTimeSchema,
})
export type Quote = z.infer<typeof quoteSchema>

/** `POST /api/quotes`. */
export const quoteRequestSchema = z.object({
  network: networkSchema.default('ethereum'),
  /** When given, `changes` are computed against that quote. */
  previousQuoteId: idSchema.optional(),
})
export type QuoteRequest = z.input<typeof quoteRequestSchema>

/** `details` of 409 QUOTE_CHANGED and checkout AVAILABILITY_CONFLICT: fresh quote to re-confirm. */
export const quoteChangedDetailsSchema = z.object({
  changes: z.array(quoteChangeSchema).min(1),
  quote: quoteSchema,
})
export type QuoteChangedDetails = z.infer<typeof quoteChangedDetailsSchema>
