import { queryOptions, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'
import type { AddCartItemRequest, Cart, Network, Quote } from '@/contracts'
import { isRetryableApiError, apiErrorKind } from '@/features/auth/session-bridge'
import type { SessionManager } from '@/features/auth/session-manager'
import { useSession, useSessionManager } from '@/features/auth/use-session'
import { queryKeys, type CartOwnerKey } from '@/lib/query-keys'
import { ensureGuestCartId, readGuestCartId, subscribeGuestCartId } from './guest-cart-id'

/**
 * Cart + quote queries and mutations (P4-01; ADR-004, ADR-006).
 *
 * - Owner: the signed-in user (`user:<id>`) or the guest cart id
 *   (`guest:<uuid>`); a guest without an id has an empty cart and no request
 *   is made until the first add creates the id.
 * - Every mutation answers with the full cart; it replaces the cache entry
 *   only when the owner is unchanged and the version is not older (out-of-
 *   order responses never roll the cart back). No optimistic totals: money
 *   comes from the quote only.
 * - Mutations share one scope, so they run one at a time in order (double
 *   clicks cannot race each other server side).
 * - The API modules (Axios, zod) are imported on demand to keep them out of
 *   the entry chunk (the header badge uses this module).
 */

const loadCartApi = () => import('@/api/cart')
const loadQuoteApi = () => import('@/api/quote')

export const QUOTE_NETWORK: Network = 'ethereum'
const CART_MUTATION_SCOPE = { id: 'cart' }

export type CartOwner =
  | { kind: 'user'; key: CartOwnerKey; userId: string }
  | { kind: 'guest'; key: CartOwnerKey; guestCartId: string }

/** `pending`: session still resolving; `none`: guest with no cart yet. */
export type CartOwnerState = { status: 'pending' } | { status: 'none' } | { status: 'ready'; owner: CartOwner }

function userOwner(userId: string): CartOwner {
  return { kind: 'user', key: `user:${userId}`, userId }
}

function guestOwner(guestCartId: string): CartOwner {
  return { kind: 'guest', key: `guest:${guestCartId}`, guestCartId }
}

/** Owner right now, read imperatively (mutations, callbacks). */
export function currentCartOwner(manager: Pick<SessionManager, 'getUserId'>): CartOwner | null {
  const userId = manager.getUserId()
  if (userId) return userOwner(userId)
  const guestCartId = readGuestCartId()
  return guestCartId ? guestOwner(guestCartId) : null
}

export function useCartOwner(): CartOwnerState {
  const session = useSession()
  const guestCartId = useSyncExternalStore(subscribeGuestCartId, readGuestCartId, () => null)
  if (session.status === 'pending') return { status: 'pending' }
  if (session.status === 'authenticated') return { status: 'ready', owner: userOwner(session.user.id) }
  return guestCartId ? { status: 'ready', owner: guestOwner(guestCartId) } : { status: 'none' }
}

/** Error thrown when the owner changed between building and sending a request. */
export class CartOwnerChangedError extends Error {
  override readonly name = 'CartOwnerChangedError'
}

async function requestOwner(owner: CartOwner, manager: Pick<SessionManager, 'getToken' | 'getUserId'>) {
  if (owner.kind === 'guest') return { kind: 'guest' as const, guestCartId: owner.guestCartId }
  const token = manager.getToken()
  if (!token || manager.getUserId() !== owner.userId) throw new CartOwnerChangedError('Cart owner changed.')
  return { kind: 'user' as const, token }
}

const retryTransient = (failureCount: number, error: unknown) => isRetryableApiError(error) && failureCount < 2

export function cartQueryOptions(owner: CartOwner, manager: SessionManager) {
  return queryOptions({
    queryKey: queryKeys.cart.owner(owner.key),
    queryFn: async ({ signal }) => {
      const [{ getCart }, request] = await Promise.all([loadCartApi(), requestOwner(owner, manager)])
      return getCart(request, { signal })
    },
    staleTime: 15_000,
    retry: retryTransient,
  })
}

export interface CartState {
  owner: CartOwnerState
  cart: Cart | undefined
  /** Units in the cart; 0 for a guest without a cart; `undefined` while unknown. */
  itemCount: number | undefined
  isPending: boolean
  isError: boolean
  error: unknown
  refetch: () => void
  isFetching: boolean
}

export function useCart(): CartState {
  const manager = useSessionManager()
  const owner = useCartOwner()
  // A disabled placeholder key while there is no owner (never fetched).
  const query = useQuery({
    ...cartQueryOptions(owner.status === 'ready' ? owner.owner : guestOwner('none'), manager),
    enabled: owner.status === 'ready',
  })
  const ready = owner.status === 'ready'
  return {
    owner,
    cart: ready ? query.data : undefined,
    itemCount: owner.status === 'none' ? 0 : ready ? query.data?.itemCount : undefined,
    isPending: owner.status === 'pending' || (ready && query.isPending),
    isError: ready && query.isError && !query.data,
    error: query.error,
    refetch: () => void query.refetch(),
    isFetching: query.isFetching,
  }
}

/** Latest quote cached for `owner` (any cart version), used as `previousQuoteId`. */
function latestQuote(queryClient: QueryClient, owner: CartOwner): Quote | undefined {
  let latest: Quote | undefined
  for (const [, data] of queryClient.getQueriesData<Quote>({ queryKey: queryKeys.cart.quotes(owner.key) })) {
    if (data && (!latest || Date.parse(data.issuedAt) > Date.parse(latest.issuedAt))) latest = data
  }
  return latest
}

/**
 * Quote for the cart `version` (key `['cart', ownerKey, 'quote', { network,
 * cartVersion }]`): a new version means a new quote, requested with the
 * previous quote id so price/availability changes are reported.
 */
export function useCartQuote(owner: CartOwner | undefined, cartVersion: number | undefined) {
  const manager = useSessionManager()
  const queryClient = useQueryClient()
  const enabled = owner !== undefined && cartVersion !== undefined
  const key = queryKeys.cart.quote(owner?.key ?? 'guest:none', { network: QUOTE_NETWORK, cartVersion: cartVersion ?? -1 })
  return useQuery({
    queryKey: key,
    enabled,
    queryFn: async ({ signal }) => {
      if (!owner) throw new CartOwnerChangedError('No cart owner.')
      const [{ createQuote }, request] = await Promise.all([loadQuoteApi(), requestOwner(owner, manager)])
      const previous = latestQuote(queryClient, owner)
      try {
        return await createQuote(request, { network: QUOTE_NETWORK, previousQuoteId: previous?.quoteId }, { signal })
      } catch (error) {
        // The previous quote is gone (mock reset): price without a baseline.
        if (previous && apiErrorKind(error) === 'not_found') {
          return createQuote(request, { network: QUOTE_NETWORK }, { signal })
        }
        throw error
      }
    },
    // A quote is valid for 5 minutes; refresh it before it expires.
    staleTime: (query) => {
      const data = query.state.data
      return data ? Math.max(0, Date.parse(data.expiresAt) - Date.now() - 30_000) : 0
    },
    refetchInterval: 4 * 60 * 1000,
    // Opening the cart re-prices it (catalog prices/stock may have moved).
    refetchOnMount: 'always',
    retry: retryTransient,
  })
}

type CartApi = Awaited<ReturnType<typeof loadCartApi>>
type RequestOwner = Awaited<ReturnType<typeof requestOwner>>

interface CartMutationContext {
  ownerKey: CartOwnerKey
}

/**
 * Shared cart mutation: resolves the owner when it runs (creating the guest
 * id only when `createGuest`), then replaces the owner's cache entry with the
 * returned cart if that owner is still current and the version is not older.
 */
function useCartMutation<TVariables>(
  name: string,
  run: (api: CartApi, owner: RequestOwner, variables: TVariables) => Promise<Cart>,
  { createGuest = false } = {},
) {
  const manager = useSessionManager()
  const queryClient = useQueryClient()
  return useMutation<{ cart: Cart; ownerKey: CartOwnerKey }, unknown, TVariables>({
    mutationKey: ['cart', name],
    scope: CART_MUTATION_SCOPE,
    retry: false,
    mutationFn: async (variables) => {
      let owner = currentCartOwner(manager)
      if (!owner && createGuest) owner = guestOwner(ensureGuestCartId())
      if (!owner) throw new CartOwnerChangedError('No cart to change.')
      const [api, request] = await Promise.all([loadCartApi(), requestOwner(owner, manager)])
      const cart = await run(api, request, variables)
      return { cart, ownerKey: owner.key } satisfies CartMutationContext & { cart: Cart }
    },
    onSuccess: ({ cart, ownerKey }) => {
      if (currentCartOwner(manager)?.key !== ownerKey) return
      const key = queryKeys.cart.owner(ownerKey)
      const cached = queryClient.getQueryData<Cart>(key)
      if (cached && cached.version > cart.version) return
      void queryClient.cancelQueries({ queryKey: key, exact: true })
      queryClient.setQueryData<Cart>(key, cart)
    },
  })
}

export function useAddToCart() {
  return useCartMutation<AddCartItemRequest>('add', (api, owner, body) => api.addCartItem(owner, body), {
    createGuest: true,
  })
}

export function useUpdateCartItem() {
  return useCartMutation<{ itemId: string; quantity: number }>('update', (api, owner, { itemId, quantity }) =>
    api.updateCartItem(owner, itemId, { quantity }),
  )
}

export function useRemoveCartItem() {
  return useCartMutation<{ itemId: string }>('remove', (api, owner, { itemId }) => api.removeCartItem(owner, itemId))
}

export function useApplyCoupon() {
  return useCartMutation<{ code: string }>('coupon', (api, owner, { code }) => api.applyCartCoupon(owner, { code }), {
    createGuest: true,
  })
}

export function useRemoveCoupon() {
  return useCartMutation<undefined>('coupon-remove', (api, owner) => api.removeCartCoupon(owner))
}
