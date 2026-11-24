import {
  isTerminalOrderStatus,
  type CreateOrderRequest,
  type Network,
  type Order,
  type OrderStatus,
  type Quote,
  type QuoteChange,
} from '@/contracts'
import { eqEth } from '@/lib/money'
import { createQuote, NETWORK_FEES, ownerKey } from './cart-store'
import { lookupCoupon } from './coupons'
import { findNft, getDb, reloadDb, updateDb, type MockDb, type OrderRecord } from './db'
import { randomHex } from './sessions'
import { findWalletById } from './wallet-store'

/**
 * Orders of the mock server (P4-02; docs/API_CONTRACTS.md "Orders").
 *
 * - Idempotency: `(userId, key) → { fingerprint, orderId }` checked before
 *   any revalidation; same fingerprint → the same order (replay), other
 *   fingerprint → `IDEMPOTENCY_CONFLICT`.
 * - Revalidation of the quote lines against the current catalog (price,
 *   availability, coupon, fee) → `QUOTE_EXPIRED` / `QUOTE_CHANGED` /
 *   `AVAILABILITY_CONFLICT` with a fresh quote.
 * - Stock is reserved at creation, kept on confirmation and released on
 *   decline. On confirmation the purchased quantities leave the cart.
 * - Resolution is deterministic: the outcome and `resolveAt` are fixed at
 *   creation from the dev checkout controls and applied lazily on the next
 *   read (`settleDueOrders`), so it survives reloads and other tabs.
 * - The receipt is a snapshot of the quote taken at creation and never
 *   re-derived from the catalog.
 */

const EXPLORERS: Readonly<Record<Network, string>> = {
  ethereum: 'https://etherscan.io/tx/',
  polygon: 'https://polygonscan.com/tx/',
  solana: 'https://solscan.io/tx/',
}

/** Canonical JSON with sorted keys (idempotency fingerprint). */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

export type CreateOrderResult =
  | { ok: true; order: Order; replayed: boolean }
  | { ok: false; status: 404; code: 'QUOTE_NOT_FOUND' | 'WALLET_NOT_FOUND' }
  | { ok: false; status: 422; code: 'EMPTY_QUOTE' }
  | {
      ok: false
      status: 409
      code: 'IDEMPOTENCY_CONFLICT' | 'QUOTE_EXPIRED' | 'WALLET_NETWORK_MISMATCH' | 'WALLET_NOT_CONNECTED'
    }
  | { ok: false; status: 409; code: 'QUOTE_CHANGED' | 'AVAILABILITY_CONFLICT'; details: { changes: QuoteChange[]; quote: Quote } }

function revalidate(quote: Quote, now: number): { changes: QuoteChange[]; availability: boolean } {
  const changes: QuoteChange[] = []
  let availability = false
  for (const line of quote.lines) {
    const nft = findNft(line.nftId)
    const edition = nft?.editions.find((e) => e.id === line.editionId)
    if (!nft || !edition || edition.available === 0) {
      changes.push({ type: 'item_unavailable', nftId: line.nftId, editionId: line.editionId })
      availability = true
      continue
    }
    if (!eqEth(nft.price, line.unitPrice)) {
      changes.push({
        type: 'price_changed',
        nftId: line.nftId,
        editionId: line.editionId,
        previousUnitPrice: line.unitPrice,
        unitPrice: nft.price,
      })
    }
    if (edition.available < line.quantity) {
      changes.push({
        type: 'availability_changed',
        nftId: line.nftId,
        editionId: line.editionId,
        requested: line.quantity,
        available: edition.available,
      })
      availability = true
    }
  }
  if (quote.coupon) {
    const lookup = lookupCoupon(quote.coupon.code, now)
    if (!lookup.ok) {
      changes.push({ type: 'coupon_invalidated', code: quote.coupon.code, reason: lookup.code === 'COUPON_EXPIRED' ? 'expired' : 'invalid' })
    }
  }
  const fee = NETWORK_FEES[quote.network]
  if (!eqEth(fee, quote.networkFee)) changes.push({ type: 'fee_changed', previousNetworkFee: quote.networkFee, networkFee: fee })
  return { changes, availability }
}

function adjustStock(state: MockDb, reservations: OrderRecord['reservations'], sign: 1 | -1): void {
  state.nfts = state.nfts.map((nft) => {
    const mine = reservations.filter((r) => r.nftId === nft.id)
    if (mine.length === 0) return nft
    const editions = nft.editions.map((edition) => {
      const quantity = mine.filter((r) => r.editionId === edition.id).reduce((sum, r) => sum + r.quantity, 0)
      return quantity === 0 ? edition : { ...edition, available: Math.max(0, edition.available + sign * quantity) }
    })
    return {
      ...nft,
      editions,
      totalAvailable: editions.reduce((sum, e) => sum + e.available, 0),
      version: nft.version + 1,
    }
  })
}

/** `POST /api/orders` after body/header validation. */
export function createOrder(userId: string, key: string, body: CreateOrderRequest, now = Date.now()): CreateOrderResult {
  reloadDb()
  const fingerprint = canonicalJson(body)
  const existing = getDb().orders.find((record) => record.userId === userId && record.order.idempotencyKey === key)
  if (existing) {
    if (existing.fingerprint !== fingerprint) return { ok: false, status: 409, code: 'IDEMPOTENCY_CONFLICT' }
    settleDueOrders(now)
    return { ok: true, order: structuredClone(currentOrder(existing.order.id) ?? existing.order), replayed: true }
  }

  const owner = { kind: 'user' as const, userId }
  const stored = getDb().quotes.find((record) => record.ownerKey === ownerKey(owner) && record.quote.quoteId === body.quoteId)
  if (!stored) return { ok: false, status: 404, code: 'QUOTE_NOT_FOUND' }
  const quote = stored.quote
  const wallet = findWalletById(userId, body.walletId)
  if (!wallet) return { ok: false, status: 404, code: 'WALLET_NOT_FOUND' }
  if (body.network !== quote.network || body.network !== wallet.network) {
    return { ok: false, status: 409, code: 'WALLET_NETWORK_MISMATCH' }
  }
  if (!wallet.connection) return { ok: false, status: 409, code: 'WALLET_NOT_CONNECTED' }
  if (Date.parse(quote.expiresAt) <= now) return { ok: false, status: 409, code: 'QUOTE_EXPIRED' }
  // An empty quote cannot become an order (receipts have at least one line).
  if (quote.lines.length === 0) return { ok: false, status: 422, code: 'EMPTY_QUOTE' }

  const { changes, availability } = revalidate(quote, now)
  if (changes.length > 0) {
    const fresh = createQuote(owner, quote.network, undefined, now)
    if (!fresh.ok) return { ok: false, status: 404, code: 'QUOTE_NOT_FOUND' }
    return {
      ok: false,
      status: 409,
      code: availability ? 'AVAILABILITY_CONFLICT' : 'QUOTE_CHANGED',
      details: { changes, quote: { ...fresh.quote, changes } },
    }
  }

  const at = new Date(now).toISOString()
  const controls = getDb().checkoutControls
  const order: Order = {
    id: `ord_${randomHex(8)}`,
    idempotencyKey: key,
    quoteId: quote.quoteId,
    network: body.network,
    wallet: { id: wallet.id, slot: wallet.slot, label: wallet.label, provider: wallet.provider, address: wallet.address },
    buyer: structuredClone(body.buyer),
    receipt: {
      currency: 'ETH',
      lines: quote.lines.map((line) => ({
        nftId: line.nftId,
        editionId: line.editionId,
        name: line.name,
        tokenId: line.tokenId,
        editionLabel: line.editionLabel,
        image: structuredClone(line.image),
        unitPrice: line.unitPrice,
        quantity: line.quantity,
        lineTotal: line.lineTotal,
      })),
      couponCode: quote.coupon?.code ?? null,
      subtotal: quote.subtotal,
      discount: quote.discount,
      networkFee: quote.networkFee,
      total: quote.total,
    },
    createdAt: at,
    updatedAt: at,
    version: 1,
    status: 'pending',
    transaction: null,
    decline: null,
  }
  const record: OrderRecord = {
    userId,
    fingerprint,
    order,
    outcome: controls.orderOutcome === 'decline' ? 'declined' : 'confirmed',
    resolveAt: controls.orderOutcome === 'pending' ? null : new Date(now + controls.resolveDelayMs).toISOString(),
    reservations: quote.lines.map((line) => ({ nftId: line.nftId, editionId: line.editionId, quantity: line.quantity })),
  }
  updateDb((state) => {
    adjustStock(state, record.reservations, -1)
    state.orders = [...state.orders, record]
  })
  return { ok: true, order: structuredClone(order), replayed: false }
}

function currentOrder(orderId: string): Order | undefined {
  return getDb().orders.find((record) => record.order.id === orderId)?.order
}

/** Moves a pending order to a terminal state (stock, cart, transaction). No-op when terminal. */
export function resolveOrder(orderId: string, status: Exclude<OrderStatus, 'pending'>, now = Date.now()): Order | undefined {
  const record = getDb().orders.find((r) => r.order.id === orderId)
  if (!record) return undefined
  if (isTerminalOrderStatus(record.order.status)) return structuredClone(record.order)
  const at = new Date(now).toISOString()
  const base = { ...record.order, updatedAt: at, version: record.order.version + 1 }
  const next: Order =
    status === 'confirmed'
      ? {
          ...base,
          status: 'confirmed',
          decline: null,
          transaction: (() => {
            const hash = `0x${randomHex(32)}`
            return { hash, explorerUrl: `${EXPLORERS[record.order.network]}${hash}` }
          })(),
        }
      : {
          ...base,
          status: 'declined',
          transaction: null,
          decline: { reason: 'PAYMENT_DECLINED', message: 'Pagamento recusado pela carteira.' },
        }
  updateDb((state) => {
    if (status === 'declined') adjustStock(state, record.reservations, 1)
    else {
      // Purchased quantities leave the user's cart (cart version bump).
      state.carts = state.carts.map((cart) => {
        if (cart.owner.kind !== 'user' || cart.owner.userId !== record.userId) return cart
        const items = cart.items
          .map((item) => {
            const bought = record.reservations
              .filter((r) => r.nftId === item.nftId && r.editionId === item.editionId)
              .reduce((sum, r) => sum + r.quantity, 0)
            return { ...item, quantity: item.quantity - bought }
          })
          .filter((item) => item.quantity > 0)
        return { ...cart, items, version: cart.version + 1, updatedAt: at }
      })
    }
    state.orders = state.orders.map((r) => (r.order.id === orderId ? { ...r, order: next } : r))
  })
  return structuredClone(next)
}

/** Applies due deterministic resolutions (called on every order read). */
export function settleDueOrders(now = Date.now()): void {
  for (const record of getDb().orders) {
    if (record.order.status !== 'pending' || record.resolveAt === null) continue
    if (Date.parse(record.resolveAt) <= now) resolveOrder(record.order.id, record.outcome, now)
  }
}

export type GetOrderResult = { ok: true; order: Order } | { ok: false; code: 'ORDER_NOT_FOUND' | 'FORBIDDEN' }

export function getOrder(userId: string, orderId: string, now = Date.now()): GetOrderResult {
  reloadDb()
  settleDueOrders(now)
  const record = getDb().orders.find((r) => r.order.id === orderId)
  if (!record) return { ok: false, code: 'ORDER_NOT_FOUND' }
  if (record.userId !== userId) return { ok: false, code: 'FORBIDDEN' }
  return { ok: true, order: structuredClone(record.order) }
}

export function listOrders(userId: string, status: OrderStatus | undefined, now = Date.now()): Order[] {
  reloadDb()
  settleDueOrders(now)
  return getDb()
    .orders.filter((r) => r.userId === userId && (status === undefined || r.order.status === status))
    .map((r) => structuredClone(r.order))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
}
