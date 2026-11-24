import {
  guestCartIdSchema,
  type Cart,
  type CartItem,
  type CartMergeResult,
  type Edition,
  type Network,
  type NftDetail,
  type Quote,
  type QuoteChange,
  type QuoteLine,
} from '@/contracts'
import { addEth, eqEth, minEth, mulEth, percentOfEth, subEthClamped, ZERO_ETH } from '@/lib/money'
import { couponDefinition, lookupCoupon } from './coupons'
import { findNft, getDb, reloadDb, updateDb, type CartRecord, type MockDb, type QuoteRecord } from './db'
import { authenticate, randomHex } from './sessions'

/**
 * Cart + quote domain logic of the mock server (P4-01, ADR-006,
 * docs/API_CONTRACTS.md "Cart" and "Quote"). Handlers stay thin: they parse
 * the request, call these functions and map results to HTTP. Money math only
 * through `src/lib/money.ts` (ADR-003).
 */

export type CartOwner = { kind: 'user'; userId: string } | { kind: 'guest'; guestCartId: string }

export const GUEST_CART_HEADER = 'x-guest-cart-id'
/** Quote lifetime (docs/API_CONTRACTS.md: 5 minutes). */
export const QUOTE_TTL_MS = 5 * 60 * 1000
/** Expired quotes are kept this long (orders/`previousQuoteId` may still reference them). */
const QUOTE_RETENTION_MS = 60 * 60 * 1000
/** Simulated network fee per network ("Taxa de rede"); ethereum per the Figma. */
export const NETWORK_FEES: Readonly<Record<Network, string>> = {
  ethereum: '0.016',
  polygon: '0.002',
  solana: '0.0005',
}

export function ownerKey(owner: CartOwner): string {
  return owner.kind === 'user' ? `user:${owner.userId}` : `guest:${owner.guestCartId}`
}

export type ResolveOwnerResult =
  | { ok: true; owner: CartOwner }
  | { ok: false; status: 400 | 401; code: 'GUEST_CART_ID_REQUIRED' | 'UNAUTHORIZED' | 'SESSION_EXPIRED' }

/**
 * Owner of a cart/quote request: the bearer user when an `Authorization`
 * header is present (it wins over `X-Guest-Cart-Id`; an invalid/expired token
 * is a 401, never a silent fallback to the guest cart), otherwise the guest
 * cart id header (must be a UUID).
 */
export async function resolveOwner(request: Request): Promise<ResolveOwnerResult> {
  if (request.headers.has('authorization')) {
    const auth = await authenticate(request)
    if (!auth.ok) return { ok: false, status: 401, code: auth.code }
    return { ok: true, owner: { kind: 'user', userId: auth.record.user.id } }
  }
  const parsed = guestCartIdSchema.safeParse(request.headers.get(GUEST_CART_HEADER) ?? '')
  if (!parsed.success) return { ok: false, status: 400, code: 'GUEST_CART_ID_REQUIRED' }
  reloadDb()
  return { ok: true, owner: { kind: 'guest', guestCartId: parsed.data } }
}

function sameOwner(a: CartRecord['owner'], b: CartOwner): boolean {
  if (a.kind === 'user') return b.kind === 'user' && a.userId === b.userId
  return b.kind === 'guest' && a.guestCartId === b.guestCartId
}

function cartIdFor(owner: CartOwner): string {
  return owner.kind === 'user' ? `cart_${owner.userId}` : `cart_guest_${owner.guestCartId}`
}

function emptyRecord(owner: CartOwner, now: number): CartRecord {
  return { id: cartIdFor(owner), owner: { ...owner }, items: [], coupon: null, version: 0, updatedAt: new Date(now).toISOString() }
}

/** Stored cart of `owner`, or `undefined` when none exists yet. */
export function findCart(owner: CartOwner, state: Pick<MockDb, 'carts'> = getDb()): CartRecord | undefined {
  return state.carts.find((cart) => sameOwner(cart.owner, owner))
}

function findEdition(nft: NftDetail | undefined, editionId: string): Edition | undefined {
  return nft?.editions.find((edition) => edition.id === editionId)
}

export function maxQuantityOf(edition: Edition): number {
  return Math.min(edition.available, edition.maxPerOrder)
}

/** Lines are stable per (nftId, editionId); edition ids are globally unique in the seed. */
function lineId(editionId: string): string {
  return `ci_${editionId}`
}

/** Public `Cart` view: current catalog snapshot per line; lines whose NFT vanished are omitted. */
export function toCartView(record: CartRecord): Cart {
  const items: CartItem[] = []
  for (const item of record.items) {
    const nft = findNft(item.nftId)
    const edition = findEdition(nft, item.editionId)
    if (!nft || !edition) continue
    items.push({
      id: item.id,
      nftId: item.nftId,
      editionId: item.editionId,
      quantity: item.quantity,
      nft: {
        slug: nft.slug,
        name: nft.name,
        tokenId: nft.tokenId,
        network: nft.network,
        image: structuredClone(nft.image),
        editionLabel: edition.label,
        unitPrice: nft.price,
        available: edition.available,
        maxQuantity: maxQuantityOf(edition),
        version: nft.version,
      },
    })
  }
  // Validity is re-checked by every quote (an expired code is dropped there and
  // reported as `coupon_invalidated`); the cart shows what is stored.
  const applied = record.coupon ? couponDefinition(record.coupon) : null
  return {
    id: record.id,
    owner: record.owner.kind,
    items,
    coupon: applied,
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    version: record.version,
    updatedAt: record.updatedAt,
  }
}

/** Cart of `owner` as returned by `GET /api/cart` (an empty, unsaved cart when none exists). */
export function getCartView(owner: CartOwner, now = Date.now()): Cart {
  return toCartView(findCart(owner) ?? emptyRecord(owner, now))
}

/**
 * Applies `mutate` to a copy of the owner's cart and persists it with a
 * bumped version, only when `mutate` returns `true` (changed). The stored
 * cart is never touched on error or no-op.
 */
function commit(owner: CartOwner, mutate: (draft: CartRecord) => boolean, now = Date.now()): Cart {
  const existing = findCart(owner)
  const draft = structuredClone(existing ?? emptyRecord(owner, now))
  if (!mutate(draft)) return toCartView(existing ?? draft)
  draft.version += 1
  draft.updatedAt = new Date(now).toISOString()
  updateDb((state) => {
    state.carts = [...state.carts.filter((cart) => !sameOwner(cart.owner, owner)), draft]
  })
  return toCartView(draft)
}

export interface AvailabilityConflict {
  nftId: string
  editionId: string
  requested: number
  available: number
  maxQuantity: number
}

export type CartMutationResult =
  | { ok: true; cart: Cart }
  | { ok: false; code: 'NFT_NOT_FOUND' | 'EDITION_NOT_FOUND' | 'CART_ITEM_NOT_FOUND' }
  | { ok: false; code: 'AVAILABILITY_CONFLICT'; details: AvailabilityConflict }

/** `POST /api/cart/items`: adds to the existing line (sum capped by min(available, maxPerOrder)). */
export function addItem(owner: CartOwner, input: { nftId: string; editionId: string; quantity: number }): CartMutationResult {
  const nft = findNft(input.nftId)
  if (!nft || nft.id !== input.nftId) return { ok: false, code: 'NFT_NOT_FOUND' }
  const edition = findEdition(nft, input.editionId)
  if (!edition) return { ok: false, code: 'EDITION_NOT_FOUND' }
  const current = findCart(owner)?.items.find((item) => item.editionId === edition.id && item.nftId === nft.id)
  const requested = (current?.quantity ?? 0) + input.quantity
  const maxQuantity = maxQuantityOf(edition)
  if (requested > maxQuantity) {
    return {
      ok: false,
      code: 'AVAILABILITY_CONFLICT',
      details: { nftId: nft.id, editionId: edition.id, requested, available: edition.available, maxQuantity },
    }
  }
  const cart = commit(owner, (draft) => {
    const line = draft.items.find((item) => item.editionId === edition.id && item.nftId === nft.id)
    if (line) line.quantity = requested
    else draft.items.push({ id: lineId(edition.id), nftId: nft.id, editionId: edition.id, quantity: requested })
    return true
  })
  return { ok: true, cart }
}

/** `PATCH /api/cart/items/:itemId`: absolute quantity. */
export function updateItem(owner: CartOwner, itemId: string, quantity: number): CartMutationResult {
  const line = findCart(owner)?.items.find((item) => item.id === itemId)
  if (!line) return { ok: false, code: 'CART_ITEM_NOT_FOUND' }
  const edition = findEdition(findNft(line.nftId), line.editionId)
  const maxQuantity = edition ? maxQuantityOf(edition) : 0
  if (quantity > maxQuantity) {
    return {
      ok: false,
      code: 'AVAILABILITY_CONFLICT',
      details: { nftId: line.nftId, editionId: line.editionId, requested: quantity, available: edition?.available ?? 0, maxQuantity },
    }
  }
  const cart = commit(owner, (draft) => {
    const target = draft.items.find((item) => item.id === itemId)
    if (!target || target.quantity === quantity) return false
    target.quantity = quantity
    return true
  })
  return { ok: true, cart }
}

/** `DELETE /api/cart/items/:itemId` (idempotent: a missing line is a no-op 200). */
export function removeItem(owner: CartOwner, itemId: string): Cart {
  return commit(owner, (draft) => {
    const before = draft.items.length
    draft.items = draft.items.filter((item) => item.id !== itemId)
    return draft.items.length !== before
  })
}

export type ApplyCouponResult = { ok: true; cart: Cart } | { ok: false; code: 'COUPON_INVALID' | 'COUPON_EXPIRED' }

/** `PUT /api/cart/coupon` with a normalized code. */
export function applyCoupon(owner: CartOwner, code: string, now = Date.now()): ApplyCouponResult {
  const lookup = lookupCoupon(code, now)
  if (!lookup.ok) return lookup
  const cart = commit(
    owner,
    (draft) => {
      if (draft.coupon === lookup.coupon.code) return false
      draft.coupon = lookup.coupon.code
      return true
    },
    now,
  )
  return { ok: true, cart }
}

/** `DELETE /api/cart/coupon` (no-op when none). */
export function removeCoupon(owner: CartOwner): Cart {
  return commit(owner, (draft) => {
    if (draft.coupon === null) return false
    draft.coupon = null
    return true
  })
}

function mergeReason(edition: Edition | undefined): CartMergeResult['adjustments'][number]['reason'] {
  if (!edition || edition.available === 0) return 'unavailable'
  return edition.available < edition.maxPerOrder ? 'availability' : 'max_per_order'
}

/**
 * ADR-006: merges the guest cart into the user's cart in one db update.
 * Same (nftId, editionId) lines are summed and capped at
 * min(available, maxPerOrder); sold-out/vanished lines are dropped. The user's
 * own existing quantity is never reduced by the merge. Every reduction is
 * reported. The user's coupon wins; the guest coupon is kept only when the
 * user has none. The guest cart is deleted. `null` when the guest cart is
 * unknown or empty (it is still deleted).
 */
export function mergeGuestCart(guestCartId: string, userId: string, now = Date.now()): CartMergeResult | null {
  reloadDb()
  const guestOwner: CartOwner = { kind: 'guest', guestCartId }
  const userOwner: CartOwner = { kind: 'user', userId }
  const guest = findCart(guestOwner)
  if (!guest) return null
  const dropGuest = (state: MockDb) => {
    state.carts = state.carts.filter((cart) => !sameOwner(cart.owner, guestOwner))
  }
  if (guest.items.length === 0 && guest.coupon === null) {
    updateDb(dropGuest)
    return null
  }

  const target = structuredClone(findCart(userOwner) ?? emptyRecord(userOwner, now))
  const adjustments: CartMergeResult['adjustments'] = []
  let mergedItems = 0
  let changed = false
  for (const line of guest.items) {
    const nft = findNft(line.nftId)
    const edition = findEdition(nft, line.editionId)
    const existing = target.items.find((item) => item.nftId === line.nftId && item.editionId === line.editionId)
    const owned = existing?.quantity ?? 0
    const requested = owned + line.quantity
    const cap = edition ? maxQuantityOf(edition) : 0
    const applied = Math.max(owned, Math.min(requested, cap))
    if (applied < requested) {
      adjustments.push({ nftId: line.nftId, editionId: line.editionId, requested, applied, reason: mergeReason(edition) })
    }
    if (applied === owned) continue
    mergedItems += 1
    changed = true
    if (existing) existing.quantity = applied
    else target.items.push({ id: lineId(line.editionId), nftId: line.nftId, editionId: line.editionId, quantity: applied })
  }
  if (target.coupon === null && guest.coupon !== null) {
    target.coupon = guest.coupon
    changed = true
  }
  if (changed) {
    target.version += 1
    target.updatedAt = new Date(now).toISOString()
  }
  updateDb((state) => {
    dropGuest(state)
    if (changed) state.carts = [...state.carts.filter((cart) => !sameOwner(cart.owner, userOwner)), target]
  })
  return { mergedItems, adjustments }
}

export type QuoteResult = { ok: true; quote: Quote } | { ok: false; code: 'QUOTE_NOT_FOUND' }

function diffQuotes(previous: Quote, lines: readonly QuoteLine[], networkFee: string, network: Network): QuoteChange[] {
  const changes: QuoteChange[] = []
  for (const prev of previous.lines) {
    const current = lines.find((line) => line.nftId === prev.nftId && line.editionId === prev.editionId)
    if (!current) continue
    if (!eqEth(prev.unitPrice, current.unitPrice)) {
      changes.push({
        type: 'price_changed',
        nftId: current.nftId,
        editionId: current.editionId,
        previousUnitPrice: prev.unitPrice,
        unitPrice: current.unitPrice,
      })
    }
    if (current.available === 0 && prev.available > 0) {
      changes.push({ type: 'item_unavailable', nftId: current.nftId, editionId: current.editionId })
    } else if (current.available !== prev.available && current.available < current.quantity) {
      changes.push({
        type: 'availability_changed',
        nftId: current.nftId,
        editionId: current.editionId,
        requested: current.quantity,
        available: current.available,
      })
    }
  }
  if (previous.network === network && !eqEth(previous.networkFee, networkFee)) {
    changes.push({ type: 'fee_changed', previousNetworkFee: previous.networkFee, networkFee })
  }
  return changes
}

/**
 * `POST /api/quotes`: prices the owner's current cart. Side-effect free for
 * the cart; the issued quote is stored (owner-scoped) so later quotes/orders
 * can reference it. `previousQuoteId` must belong to the same owner.
 */
export function createQuote(owner: CartOwner, network: Network, previousQuoteId: string | undefined, now = Date.now()): QuoteResult {
  const key = ownerKey(owner)
  let previous: Quote | undefined
  if (previousQuoteId !== undefined) {
    previous = getDb().quotes.find((record) => record.ownerKey === key && record.quote.quoteId === previousQuoteId)?.quote
    if (!previous) return { ok: false, code: 'QUOTE_NOT_FOUND' }
  }

  const cart = toCartView(findCart(owner) ?? emptyRecord(owner, now))
  const lines: QuoteLine[] = cart.items.map((item) => ({
    cartItemId: item.id,
    nftId: item.nftId,
    editionId: item.editionId,
    name: item.nft.name,
    tokenId: item.nft.tokenId,
    editionLabel: item.nft.editionLabel,
    image: item.nft.image,
    unitPrice: item.nft.unitPrice,
    quantity: item.quantity,
    lineTotal: mulEth(item.nft.unitPrice, item.quantity),
    available: item.nft.available,
    nftVersion: item.nft.version,
  }))
  const subtotal = addEth(ZERO_ETH, ...lines.map((line) => line.lineTotal))

  const changes: QuoteChange[] = []
  const storedCode = findCart(owner)?.coupon ?? null
  const lookup = storedCode ? lookupCoupon(storedCode, now) : undefined
  const coupon = lookup?.ok ? lookup.coupon : null
  if (storedCode && lookup && !lookup.ok) {
    changes.push({ type: 'coupon_invalidated', code: storedCode, reason: lookup.code === 'COUPON_EXPIRED' ? 'expired' : 'invalid' })
  }
  let discount = ZERO_ETH
  if (coupon?.kind === 'percent') discount = percentOfEth(subtotal, coupon.percent)
  else if (coupon?.kind === 'fixed') discount = minEth(coupon.amount, subtotal)

  const networkFee = NETWORK_FEES[network]
  const total = addEth(subEthClamped(subtotal, discount), networkFee)
  if (previous) changes.unshift(...diffQuotes(previous, lines, networkFee, network))

  const quote: Quote = {
    quoteId: `qt_${randomHex(12)}`,
    cartVersion: cart.version,
    network,
    currency: 'ETH',
    lines,
    coupon,
    subtotal,
    discount,
    networkFee,
    total,
    changes,
    purchasable: lines.length > 0 && lines.every((line) => line.quantity <= line.available),
    issuedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + QUOTE_TTL_MS).toISOString(),
  }
  const record: QuoteRecord = { ownerKey: key, quote }
  updateDb((state) => {
    state.quotes = [
      ...state.quotes.filter((stored) => Date.parse(stored.quote.expiresAt) + QUOTE_RETENTION_MS > now),
      record,
    ]
  })
  return { ok: true, quote: structuredClone(quote) }
}
