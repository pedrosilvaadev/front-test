import type { QueryClient } from '@tanstack/react-query'
import {
  isNewerVersion,
  isTerminalOrderStatus,
  type NftUpdatedEvent,
  type Order,
  type OrderUpdatedEvent,
} from '@/contracts'
import { queryKeys } from '@/lib/query-keys'

/**
 * Applies realtime events to the TanStack Query cache (P5-01,
 * docs/API_CONTRACTS.md "Realtime"). Pure functions of `(queryClient, event)`
 * so they are unit tested without a socket.
 *
 * Stale-event protection: every cached object carries the server `version`;
 * an event only patches objects whose version is older (`isNewerVersion`).
 * Duplicates are dropped earlier by `eventId` (`createEventDeduper`).
 */

type NftPatch = NftUpdatedEvent['data'] & { version: number }

interface Versioned {
  id: string
  version: number
}

function isVersionedNft(value: unknown, nftId: string): value is Versioned & Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return record.id === nftId && typeof record.version === 'number' && typeof record.price === 'string'
}

/**
 * Structural patch of every object that represents the NFT (`NftSummary` in
 * lists/featured/related, `NftDetail` in the detail). Returns the same
 * reference when nothing changed so unrelated queries do not re-render.
 */
function patchDeep(value: unknown, patch: NftPatch): unknown {
  if (Array.isArray(value)) {
    let changed = false
    const next = value.map((item) => {
      const patched = patchDeep(item, patch)
      if (patched !== item) changed = true
      return patched
    })
    return changed ? next : value
  }
  if (typeof value !== 'object' || value === null) return value
  if (isVersionedNft(value, patch.nftId)) {
    if (!isNewerVersion(patch.version, value.version)) return value
    const next: Record<string, unknown> = {
      ...value,
      price: patch.price,
      previousPrice: patch.previousPrice,
      totalAvailable: patch.totalAvailable,
      version: patch.version,
    }
    if (Array.isArray(value.editions)) {
      next.editions = (value.editions as { id: string; available: number }[]).map((edition) => {
        const update = patch.editions.find((item) => item.editionId === edition.id)
        return update ? { ...edition, available: update.available } : edition
      })
    }
    return next
  }
  let changed = false
  const next: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value)) {
    const patched = patchDeep(child, patch)
    if (patched !== child) changed = true
    next[key] = patched
  }
  return changed ? next : value
}

function containsNft(value: unknown, nftId: string): boolean {
  if (Array.isArray(value)) return value.some((item) => containsNft(item, nftId))
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  if (record.nftId === nftId) return true
  return Object.values(record).some((child) => containsNft(child, nftId))
}

/** Calls `match` on every object of every cached query under `prefix` until it returns a value. */
function findInCache<T>(queryClient: QueryClient, prefix: readonly unknown[], match: (record: Record<string, unknown>) => T | undefined): T | undefined {
  let found: T | undefined
  const visit = (value: unknown): void => {
    if (found !== undefined || typeof value !== 'object' || value === null) return
    if (Array.isArray(value)) return value.forEach(visit)
    const record = value as Record<string, unknown>
    found = match(record)
    if (found === undefined) Object.values(record).forEach(visit)
  }
  for (const [, data] of queryClient.getQueriesData({ queryKey: prefix })) visit(data)
  return found
}

/** Name of the NFT from any cached copy: catalog summaries/details, cart items (`nft.name`) or quote lines (for the announcement). */
function cachedName(queryClient: QueryClient, nftId: string): string | undefined {
  const fromCatalog = findInCache(queryClient, queryKeys.catalog.all, (record) =>
    record.id === nftId && typeof record.name === 'string' && typeof record.price === 'string' ? record.name : undefined,
  )
  return (
    fromCatalog ??
    findInCache(queryClient, queryKeys.cart.all, (record) => {
      if (record.nftId !== nftId) return undefined
      if (typeof record.name === 'string') return record.name
      const nft = record.nft as { name?: unknown } | undefined
      return typeof nft?.name === 'string' ? nft.name : undefined
    })
  )
}

/** Highest NFT version the cart/quote was priced with (`QuoteLine.nftVersion`, cart item `nft.version`). */
function cartNftVersion(queryClient: QueryClient, nftId: string): number | undefined {
  let highest: number | undefined
  findInCache(queryClient, queryKeys.cart.all, (record) => {
    if (record.nftId !== nftId) return undefined
    const nft = record.nft as { version?: unknown } | undefined
    const version = typeof record.nftVersion === 'number' ? record.nftVersion : typeof nft?.version === 'number' ? nft.version : undefined
    if (version !== undefined && (highest === undefined || version > highest)) highest = version
    return undefined
  })
  return highest
}

export interface NftEventOutcome {
  /** At least one cached copy was older and got patched. */
  applied: boolean
  /** The NFT is in the cart or its quote → cart + quote were invalidated. */
  inCart: boolean
  /** Shown on an active detail page or in the cart (worth announcing). */
  relevant: boolean
  name: string | undefined
}

/**
 * `nft.updated`: patch catalog caches when newer, mark list queries stale
 * (price/stock affect filters and sorting), and re-price the cart when the
 * NFT is in it (the quote refetch reports the change; an open checkout must
 * accept it before confirming).
 */
export function applyNftUpdated(queryClient: QueryClient, event: NftUpdatedEvent): NftEventOutcome {
  const patch: NftPatch = { ...event.data, version: event.version }
  const name = cachedName(queryClient, patch.nftId)
  let applied = false
  for (const [key, data] of queryClient.getQueriesData({ queryKey: queryKeys.catalog.all })) {
    const next = patchDeep(data, patch)
    if (next !== data) {
      applied = true
      queryClient.setQueryData(key, next)
    }
  }
  if (applied) void queryClient.invalidateQueries({ queryKey: queryKeys.catalog.lists(), refetchType: 'none' })

  // In the cart and newer than what the cart was priced with (stale/duplicate events re-price nothing).
  const inCart =
    queryClient.getQueriesData({ queryKey: queryKeys.cart.all }).some(([, data]) => containsNft(data, patch.nftId)) &&
    isNewerVersion(patch.version, cartNftVersion(queryClient, patch.nftId))
  if (inCart) void queryClient.invalidateQueries({ queryKey: queryKeys.cart.all })

  const onActiveDetail = queryClient
    .getQueryCache()
    .findAll({ queryKey: ['catalog', 'detail'], type: 'active' })
    .some((query) => isVersionedNft(query.state.data, patch.nftId))
  return { applied, inCart, relevant: inCart || (applied && onActiveDetail), name }
}

export interface OrderEventOutcome {
  applied: boolean
  status: Order['status'] | undefined
}

/**
 * `order.updated`: ignored when it belongs to another user (previous
 * session); patches the cached order when newer and never regresses a
 * terminal state. A terminal order refreshes the orders list, and a
 * confirmation the cart (bought items leave it) and the catalog (stock).
 */
export function applyOrderUpdated(
  queryClient: QueryClient,
  event: OrderUpdatedEvent,
  currentUserId: string | null,
): OrderEventOutcome {
  const { data } = event
  if (currentUserId === null || data.userId !== currentUserId) return { applied: false, status: undefined }
  const key = queryKeys.user.order(currentUserId, data.orderId)
  const cached = queryClient.getQueryData<Order>(key)
  let applied = false
  if (cached) {
    const regresses = isTerminalOrderStatus(cached.status) && cached.status !== data.status
    if (isNewerVersion(event.version, cached.version) && !regresses) {
      const next = {
        ...cached,
        status: data.status,
        transaction: data.transaction,
        decline: data.decline,
        updatedAt: data.updatedAt,
        version: event.version,
      } as Order
      queryClient.setQueryData(key, next)
      applied = true
    }
  }
  if (isTerminalOrderStatus(data.status)) {
    void queryClient.invalidateQueries({ queryKey: [...queryKeys.user.all, currentUserId, 'orders', 'list'] })
    if (data.status === 'confirmed') void queryClient.invalidateQueries({ queryKey: queryKeys.cart.all })
  }
  return { applied, status: applied ? data.status : undefined }
}

/**
 * After a reconnection (events may have been missed): REST wins. Refetch
 * active catalog/detail queries, the cart and its quote, and every cached
 * order that is still pending.
 */
export function reconcileAfterReconnect(queryClient: QueryClient, userId: string | null): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.catalog.all })
  void queryClient.invalidateQueries({ queryKey: queryKeys.cart.all })
  if (userId === null) return
  void queryClient.invalidateQueries({
    queryKey: [...queryKeys.user.all, userId, 'orders'],
    predicate: (query) => {
      const data = query.state.data as Partial<Order> | undefined
      return Array.isArray(data) || data?.status === 'pending'
    },
  })
}

/** Bounded set of seen `eventId`s (oldest evicted first). `seen(id)` is true for duplicates. */
export function createEventDeduper(limit = 500) {
  const ids = new Set<string>()
  return {
    seen(eventId: string): boolean {
      if (ids.has(eventId)) return true
      ids.add(eventId)
      if (ids.size > limit) {
        const oldest = ids.values().next().value
        if (oldest !== undefined) ids.delete(oldest)
      }
      return false
    },
  }
}
