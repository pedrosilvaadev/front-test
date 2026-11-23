import { z } from 'zod'
import {
  currencySchema,
  displayNameSchema,
  emailSchema,
  ensNameSchema,
  ethAmountSchema,
  idSchema,
  imageSchema,
  isoDateTimeSchema,
  networkSchema,
  quantitySchema,
  referralCodeSchema,
  txHashSchema,
  usernameSchema,
  versionSchema,
} from './common/primitives'
import { walletProviderSchema, walletSlotSchema } from './wallets'

/**
 * Orders (README §3 "Pagamento e confirmação"; §5 "Pedidos"; §7 `order.updated`).
 * Auth required. Creation is idempotent via the `Idempotency-Key` header:
 *  - same key + same payload → the same order (200 + `Idempotent-Replayed: true`);
 *  - same key + different payload → 409 IDEMPOTENCY_CONFLICT;
 *  - missing/invalid key → 400 IDEMPOTENCY_KEY_REQUIRED.
 * Keys are scoped per user. `pending` → `confirmed` | `declined`; both terminal.
 */
export const ORDER_STATUSES = ['pending', 'confirmed', 'declined'] as const
export const orderStatusSchema = z.enum(ORDER_STATUSES)
export type OrderStatus = z.infer<typeof orderStatusSchema>

export function isTerminalOrderStatus(status: OrderStatus): boolean {
  return status !== 'pending'
}

/** Collector data from the Figma "Pagamento" form. */
export const buyerSchema = z.object({
  displayName: displayNameSchema,
  username: usernameSchema,
  profileName: z.string().trim().min(2).max(50),
  email: emailSchema,
  ensName: ensNameSchema,
  referralCode: referralCodeSchema,
})
export type Buyer = z.infer<typeof buyerSchema>

/**
 * `POST /api/orders` body. The payload fingerprint for idempotency is its
 * canonical JSON. `network` must equal the quote network and the wallet's
 * network (409 WALLET_NETWORK_MISMATCH); the wallet must be connected
 * (409 WALLET_NOT_CONNECTED). Clients persist `{ idempotencyKey, payload,
 * orderId? }` per user before sending and resolve it before minting a new key
 * (docs/API_CONTRACTS.md, Orders → Idempotency; ADR-004).
 */
export const createOrderRequestSchema = z.object({
  quoteId: idSchema,
  network: networkSchema,
  walletId: idSchema,
  buyer: buyerSchema,
  /** "Observação do colecionador (opcional)". */
  note: z.string().trim().max(500).optional(),
})
export type CreateOrderRequest = z.infer<typeof createOrderRequestSchema>

/** Immutable receipt snapshot taken at order creation; never re-derived from the catalog. */
export const receiptLineSchema = z.object({
  nftId: idSchema,
  editionId: idSchema,
  name: z.string().min(1),
  tokenId: z.string().min(1),
  editionLabel: z.string().min(1),
  image: imageSchema,
  unitPrice: ethAmountSchema,
  quantity: quantitySchema,
  lineTotal: ethAmountSchema,
})
export type ReceiptLine = z.infer<typeof receiptLineSchema>

export const receiptSchema = z.object({
  currency: currencySchema,
  lines: z.array(receiptLineSchema).min(1),
  couponCode: z.string().nullable(),
  subtotal: ethAmountSchema,
  discount: ethAmountSchema,
  networkFee: ethAmountSchema,
  total: ethAmountSchema,
})
export type Receipt = z.infer<typeof receiptSchema>

export const transactionSchema = z.object({
  /** Simulated hash shown as "ID da transação" (0xA91F…E82C). */
  hash: txHashSchema,
  /** Simulated explorer link ("Ver no Etherscan"). */
  explorerUrl: z.url({ protocol: /^https$/, hostname: z.regexes.domain }),
})
export type Transaction = z.infer<typeof transactionSchema>

export const DECLINE_REASONS = ['PAYMENT_DECLINED', 'INSUFFICIENT_FUNDS', 'WALLET_REJECTED'] as const
export const declineSchema = z.object({ reason: z.enum(DECLINE_REASONS), message: z.string() })

/**
 * Status-dependent fields. Invalid combinations are unrepresentable:
 *  - `pending`:   transaction null, decline null;
 *  - `confirmed`: transaction required (simulated hash + explorer link), decline null;
 *  - `declined`:  decline required, transaction null.
 */
export const ORDER_STATE_SHAPES = {
  pending: { status: z.literal('pending'), transaction: z.null(), decline: z.null() },
  confirmed: { status: z.literal('confirmed'), transaction: transactionSchema, decline: z.null() },
  declined: { status: z.literal('declined'), transaction: z.null(), decline: declineSchema },
} as const

/** Builds a status-discriminated union of `base` + each order state (orders and `order.updated`). */
export function withOrderState<TBase extends z.ZodRawShape>(base: TBase) {
  return z.discriminatedUnion('status', [
    z.object({ ...base, ...ORDER_STATE_SHAPES.pending }),
    z.object({ ...base, ...ORDER_STATE_SHAPES.confirmed }),
    z.object({ ...base, ...ORDER_STATE_SHAPES.declined }),
  ])
}

export const orderSchema = withOrderState({
  id: idSchema,
  idempotencyKey: z.uuid(),
  quoteId: idSchema,
  network: networkSchema,
  wallet: z.object({
    id: idSchema,
    slot: walletSlotSchema,
    label: z.string(),
    provider: walletProviderSchema,
    address: z.string().min(1),
  }),
  buyer: buyerSchema,
  receipt: receiptSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  /** Monotonic; matches `order.updated` version. */
  version: versionSchema,
})
export type Order = z.infer<typeof orderSchema>

/** `GET /api/orders?status=pending` (pending recovery after refresh) → newest first. */
export const orderListQuerySchema = z.object({ status: orderStatusSchema.optional() })
export const orderListSchema = z.object({ items: z.array(orderSchema) })
export type OrderList = z.infer<typeof orderListSchema>
