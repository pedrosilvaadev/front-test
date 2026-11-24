import { isCancelledError, queryOptions, type QueryClient } from '@tanstack/react-query'
import type { CartMergeResult, Session, SessionInfo } from '@/contracts'
import { forgetGuestCartId } from '@/features/cart/guest-cart-id'
import { dismissCartMergeNotice, publishCartMergeNotice } from '@/features/cart/merge-notice'
import { clearCheckoutStateForUser, clearCheckoutStateOnLogout } from '@/features/checkout/checkout-storage'
import { queryKeys } from '@/lib/query-keys'
import { apiErrorKind, isRetryableApiError, setAuthBridge } from './session-bridge'

/**
 * Bundle note: this module is part of the entry chunk (router context), so it
 * only imports types from the contracts and loads the auth API (Axios, zod
 * schemas) on demand.
 */
const loadAuthApi = () => import('@/api/auth')

/**
 * Client session (ADR-004, ADR-005).
 *
 * - The bearer token lives in memory and in `localStorage` (`kurio.session`,
 *   `{ token, userId, expiresAt }`; never the password). The `['session']`
 *   query (`SessionInfo | null`) is the source of truth for "who is signed in".
 * - Boot: a stored token is revalidated with `GET /api/auth/session` before a
 *   private route resolves. An invalid/expired *stored* token is dropped
 *   silently (the visitor is a guest).
 * - A token that was valid in this tab and is then rejected (401
 *   `SESSION_EXPIRED`/`UNAUTHORIZED` on any authenticated call) is a lost
 *   session: private caches are cancelled and removed, the token is cleared
 *   and listeners are told to send the user to `/login?redirect=…&reason=expired`.
 * - Logout and user switch clear private caches too; other tabs follow
 *   through the `storage` event.
 */

export const SESSION_STORAGE_KEY = 'kurio.session'

interface StoredSession {
  token: string
  userId: string
  expiresAt: string
}

export type SessionStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** Why the session ended. `invalid` = stored token rejected at boot (silent). */
export type SessionEndReason = 'expired' | 'invalid' | 'logout' | 'remote-logout' | 'remote-login'

export interface SessionEvent {
  reason: SessionEndReason
  /** `true` when the app should navigate to the login page (expired outside a route guard). */
  redirectToLogin: boolean
}

type SessionListener = (event: SessionEvent) => void

export interface SessionManager {
  /** Current bearer token (memory). */
  getToken: () => string | null
  /** User id of the current token (cart owner key `user:<id>`), `null` for guests. */
  getUserId: () => string | null
  /** Query options for `['session']`; never throws for 401 (resolves `null`). */
  sessionQueryOptions: () => ReturnType<typeof buildSessionQueryOptions>
  /** Cached session, fetching it once if unknown (boot). */
  ensureSession: () => Promise<SessionInfo | null>
  /** Always asks the server (route guards). A lost session resolves `null` without navigating. */
  revalidateSession: () => Promise<SessionInfo | null>
  /** Reason of the last session loss, consumed by the login redirect. */
  takeEndReason: () => SessionEndReason | null
  /**
   * Stores a session returned by login/register and clears the previous
   * user's private data. The guest cart was merged server side (ADR-006): its
   * id is forgotten and `cartMerge` (adjustments) is published to the UI.
   */
  signIn: (session: Session, cartMerge?: CartMergeResult | null) => void
  /** Local logout (immediate) + best-effort `POST /api/auth/logout`. */
  signOut: () => Promise<void>
  subscribe: (listener: SessionListener) => () => void
  dispose: () => void
}

interface CreateSessionManagerOptions {
  queryClient: QueryClient
  storage?: SessionStorage
  /** Window to listen for cross-tab `storage` events on. */
  target?: Pick<Window, 'addEventListener' | 'removeEventListener'>
  /** Installs the Axios bridge (bearer header + 401 hook). Default true. */
  connectApi?: boolean
}

function defaultStorage(): SessionStorage | undefined {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

function parseStored(raw: string | null | undefined): StoredSession | null {
  if (!raw) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null) return null
    const { token, userId, expiresAt } = value as Record<string, unknown>
    // Same rules as the contract (`sessionSchema`: token ≥ 16, opaque id ≤ 128, ISO timestamp).
    if (typeof token !== 'string' || token.length < 16) return null
    if (typeof userId !== 'string' || userId.length === 0 || userId.length > 128) return null
    if (typeof expiresAt !== 'string' || Number.isNaN(Date.parse(expiresAt))) return null
    return { token, userId, expiresAt }
  } catch {
    return null
  }
}

function buildSessionQueryOptions(queryFn: (signal: AbortSignal) => Promise<SessionInfo | null>, initial: () => SessionInfo | null | undefined) {
  return queryOptions({
    queryKey: queryKeys.session(),
    queryFn: ({ signal }) => queryFn(signal),
    initialData: initial,
    staleTime: 30_000,
    // Only transient failures are retried; 401 never reaches here (resolved as null).
    retry: (failureCount, error) => isRetryableApiError(error) && failureCount < 2,
  })
}

export function createSessionManager({
  queryClient,
  storage = defaultStorage(),
  target = typeof window === 'undefined' ? undefined : window,
  connectApi = true,
}: CreateSessionManagerOptions): SessionManager {
  let stored: StoredSession | null = parseStored(safeGet(storage))
  /** Token confirmed by the server in this tab (losing it is an "expiry", not a silent boot drop). */
  let validatedToken: string | null = null
  let endReason: SessionEndReason | null = null
  let guardDepth = 0
  const listeners = new Set<SessionListener>()

  function safeGet(source: SessionStorage | undefined): string | null {
    try {
      return source?.getItem(SESSION_STORAGE_KEY) ?? null
    } catch {
      return null
    }
  }

  function writeStored(next: StoredSession | null): void {
    stored = next
    try {
      if (next) storage?.setItem(SESSION_STORAGE_KEY, JSON.stringify(next))
      else storage?.removeItem(SESSION_STORAGE_KEY)
    } catch {
      // Storage unavailable (privacy mode): the session stays memory only.
    }
  }

  function emit(event: SessionEvent): void {
    for (const listener of [...listeners]) listener(event)
  }

  /** ADR-004: cancel then remove private (`user`, `cart`) queries. */
  function clearPrivateQueries(): void {
    for (const queryKey of [queryKeys.user.all, queryKeys.cart.all]) {
      void queryClient.cancelQueries({ queryKey })
      queryClient.removeQueries({ queryKey })
    }
  }

  /**
   * Cancel any in-flight `['session']` fetch (its result belongs to the old
   * token) and replace the entry with the known state. The entry is replaced
   * rather than removed so mounted observers (header, menus) update at once;
   * a removed query would leave them showing the previous user.
   */
  function replaceSessionQuery(value: SessionInfo | null): void {
    const queryKey = queryKeys.session()
    void queryClient.cancelQueries({ queryKey })
    queryClient.setQueryData<SessionInfo | null>(queryKey, value)
  }

  function endSession(reason: SessionEndReason, { insideSessionQuery = false } = {}): void {
    // ADR-004: checkout attempts/draft are kept on expiry, removed on explicit logout.
    if (reason === 'logout' || reason === 'remote-logout') clearCheckoutStateOnLogout(stored?.userId ?? null)
    writeStored(null)
    validatedToken = null
    endReason = reason
    clearPrivateQueries()
    clearMutations()
    dismissCartMergeNotice()
    if (!insideSessionQuery) replaceSessionQuery(null)
    emit({ reason, redirectToLogin: reason === 'expired' && guardDepth === 0 })
  }

  function currentCachedSession(): SessionInfo | null {
    if (!stored) return null
    return queryClient.getQueryData<SessionInfo | null>(queryKeys.session()) ?? null
  }

  /**
   * Login/register mutation variables carry the plaintext password: drop
   * them (and any other non-cart mutation) from the cache when the session
   * changes (forms also reset on success and use `gcTime: 0`). Cart
   * mutations (`['cart', ...]` keys, no secrets) are kept so their observers
   * settle normally; their callbacks ignore results for a previous owner.
   */
  function clearMutations(): void {
    const cache = queryClient.getMutationCache()
    for (const mutation of cache.getAll()) {
      if (mutation.options.mutationKey?.[0] !== 'cart') cache.remove(mutation)
    }
  }

  async function fetchSession(signal: AbortSignal): Promise<SessionInfo | null> {
    const token = stored?.token
    if (!token) return null
    try {
      const { getSession } = await loadAuthApi()
      const info = await getSession(token, { signal })
      // Replaced meanwhile (login/logout/other tab): never report the old token's
      // user; keep whatever the cache already holds for the current token.
      if (stored?.token !== token) return currentCachedSession()
      validatedToken = token
      if (info.user.id !== stored.userId || info.expiresAt !== stored.expiresAt) {
        writeStored({ token, userId: info.user.id, expiresAt: info.expiresAt })
      }
      return info
    } catch (error) {
      if (apiErrorKind(error) === 'unauthorized') {
        if (stored?.token !== token) return currentCachedSession()
        endSession(validatedToken === token ? 'expired' : 'invalid', { insideSessionQuery: true })
        return null
      }
      throw error
    }
  }

  const options = () =>
    buildSessionQueryOptions(fetchSession, () => (stored ? undefined : null))

  function onSessionRejected(_error: unknown, token: string): void {
    // A late response for a previous session must not end the current one.
    if (!stored || stored.token !== token) return
    endSession('expired')
  }

  function onStorage(event: StorageEvent): void {
    if (event.key !== null && event.key !== SESSION_STORAGE_KEY) return
    if (event.storageArea && storage && event.storageArea !== (storage as unknown)) return
    const next = parseStored(event.key === null ? null : event.newValue)
    if (next?.token === stored?.token) return
    if (!next) {
      if (!stored) return
      // Signed out in another tab: local logout only (that tab revoked the token).
      endSession('remote-logout')
      return
    }
    // Signed in (possibly as another user) in another tab: adopt its token and revalidate.
    clearCheckoutStateForUser(next.userId)
    stored = next
    validatedToken = next.token
    endReason = null
    clearPrivateQueries()
    clearMutations()
    // Never keep showing the previous user while the new token is checked.
    replaceSessionQuery(null)
    queryClient.fetchQuery({ ...options(), staleTime: 0 }).catch(() => {
      // Offline: the chrome stays guest until the next revalidation (guards retry).
    })
    emit({ reason: 'remote-login', redirectToLogin: false })
  }

  const disposers: (() => void)[] = []
  if (connectApi) {
    disposers.push(setAuthBridge({ getToken: () => stored?.token ?? null, onSessionRejected }))
  }
  if (target) {
    target.addEventListener('storage', onStorage)
    disposers.push(() => target.removeEventListener('storage', onStorage))
  }

  return {
    getToken: () => stored?.token ?? null,
    getUserId: () => stored?.userId ?? null,
    sessionQueryOptions: options,
    ensureSession: () => queryClient.ensureQueryData(options()),
    async revalidateSession() {
      guardDepth += 1
      try {
        try {
          return await queryClient.fetchQuery({ ...options(), staleTime: 0 })
        } catch (error) {
          // A sign-in/out (or another tab) replaced the session while the guard
          // was checking: its fetch was cancelled. Ask again for the new token once.
          if (!isCancelledError(error)) throw error
          return await queryClient.fetchQuery({ ...options(), staleTime: 0 })
        }
      } finally {
        guardDepth -= 1
      }
    },
    takeEndReason() {
      const reason = endReason
      endReason = null
      return reason
    },
    signIn(session, cartMerge = null) {
      writeStored({ token: session.token, userId: session.user.id, expiresAt: session.expiresAt })
      forgetGuestCartId()
      publishCartMergeNotice(cartMerge)
      // A different user never inherits another user's checkout attempt or draft (ADR-004).
      clearCheckoutStateForUser(session.user.id)
      validatedToken = session.token
      endReason = null
      // Guest → user (cart key changes) or user switch: never show another owner's data.
      clearPrivateQueries()
      clearMutations()
      replaceSessionQuery({ user: session.user, expiresAt: session.expiresAt })
    },
    async signOut() {
      const token = stored?.token
      endSession('logout')
      if (!token) return
      try {
        const { logout } = await loadAuthApi()
        await logout(token)
      } catch {
        // Best effort: the local session is already gone; the token expires server side.
      }
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    dispose() {
      for (const dispose of disposers.splice(0)) dispose()
      listeners.clear()
    },
  }
}
