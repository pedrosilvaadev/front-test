import { queryOptions, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import type { Favorite, FavoriteList, NftSummary } from '@/contracts'
import { loginSearch } from '@/features/auth/redirect'
import { isRetryableApiError } from '@/features/auth/session-bridge'
import type { SessionManager } from '@/features/auth/session-manager'
import { useSession, useSessionManager } from '@/features/auth/use-session'
import { queryKeys } from '@/lib/query-keys'

/**
 * Favorites (P3-02; README §4 optimistic update + rollback; ADR-004).
 *
 * - Cache `['user', userId, 'favorites']`; requests carry the token of that
 *   user and are refused when the session changed meanwhile.
 * - Toggle is optimistic: the list is patched for that NFT only; on error
 *   only that NFT is restored (other in-flight toggles are untouched). The
 *   server is idempotent (PUT/DELETE), and toggles of one NFT share a scope so
 *   they reach the server in click order.
 * - Callbacks of a toggle started by a previous user never touch the cache.
 * - API module loaded on demand (keeps Axios/zod out of the entry chunk).
 */

const loadFavoritesApi = () => import('@/api/favorites')

export const FAVORITES_MUTATION_KEY = ['favorites', 'toggle'] as const

export class FavoritesOwnerChangedError extends Error {
  override readonly name = 'FavoritesOwnerChangedError'
}

/** Token of `userId` right now, or throws when the session changed. */
export function tokenFor(manager: Pick<SessionManager, 'getToken' | 'getUserId'>, userId: string): string {
  const token = manager.getToken()
  if (!token || manager.getUserId() !== userId) throw new FavoritesOwnerChangedError('Session changed.')
  return token
}

const retryTransient = (failureCount: number, error: unknown) => isRetryableApiError(error) && failureCount < 2

export function favoritesQueryOptions(userId: string, manager: Pick<SessionManager, 'getToken' | 'getUserId'>) {
  return queryOptions({
    queryKey: queryKeys.user.favorites(userId),
    queryFn: async ({ signal }) => {
      const api = await loadFavoritesApi()
      return api.getFavorites({ signal, token: tokenFor(manager, userId) })
    },
    staleTime: 30_000,
    retry: retryTransient,
  })
}

/** Favorites of the signed-in user (`undefined` data for guests/pending). */
export function useFavoritesList() {
  const session = useSession()
  const manager = useSessionManager()
  const userId = session.status === 'authenticated' ? session.user.id : null
  const query = useQuery({
    ...favoritesQueryOptions(userId ?? '', manager),
    enabled: userId !== null,
  })
  return { userId, session: session.status, query }
}

export interface ToggleVariables {
  userId: string
  nft: NftSummary
  favorite: boolean
}

interface ToggleContext {
  previous: Favorite | undefined
  index: number
}

/** Pure optimistic patch: add (newest first) or remove one NFT. */
export function applyFavorite(list: FavoriteList | undefined, nft: NftSummary, favorite: boolean, now = Date.now()): FavoriteList {
  const items = (list?.items ?? []).filter((item) => item.nftId !== nft.id)
  if (!favorite) return { items }
  return { items: [{ nftId: nft.id, createdAt: new Date(now).toISOString(), nft }, ...items] }
}

/** Restores one NFT to its state before the failed toggle. */
export function rollbackFavorite(list: FavoriteList | undefined, nftId: string, context: ToggleContext): FavoriteList {
  const items = (list?.items ?? []).filter((item) => item.nftId !== nftId)
  if (context.previous) items.splice(Math.min(Math.max(context.index, 0), items.length), 0, context.previous)
  return { items }
}

/** Mutation options, exported for unit tests (rollback with a real QueryClient). */
export function favoriteToggleOptions(queryClient: QueryClient, manager: Pick<SessionManager, 'getToken' | 'getUserId'>) {
  const sameUser = (userId: string) => manager.getUserId() === userId
  return {
    mutationKey: FAVORITES_MUTATION_KEY,
    mutationFn: async ({ userId, nft, favorite }: ToggleVariables) => {
      const token = tokenFor(manager, userId)
      const api = await loadFavoritesApi()
      return favorite ? api.addFavorite(nft.id, { token }) : api.removeFavorite(nft.id, { token })
    },
    onMutate: async ({ userId, nft, favorite }: ToggleVariables): Promise<ToggleContext> => {
      const queryKey = queryKeys.user.favorites(userId)
      await queryClient.cancelQueries({ queryKey })
      const current = queryClient.getQueryData<FavoriteList>(queryKey)
      const index = current?.items.findIndex((item) => item.nftId === nft.id) ?? -1
      const context = { previous: index >= 0 ? current?.items[index] : undefined, index }
      if (sameUser(userId)) queryClient.setQueryData<FavoriteList>(queryKey, applyFavorite(current, nft, favorite))
      return context
    },
    onError: (_error: unknown, { userId, nft }: ToggleVariables, context: ToggleContext | undefined) => {
      if (!context || !sameUser(userId)) return
      const queryKey = queryKeys.user.favorites(userId)
      queryClient.setQueryData<FavoriteList>(queryKey, (list) => rollbackFavorite(list, nft.id, context))
    },
    onSettled: (_data: unknown, _error: unknown, { userId }: ToggleVariables) => {
      if (!sameUser(userId)) return
      // Reconcile once the last pending toggle finished (avoids flicker between clicks).
      if (queryClient.isMutating({ mutationKey: FAVORITES_MUTATION_KEY }) <= 1) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.user.favorites(userId) })
      }
    },
  }
}

export interface FavoriteToggle {
  /** `null` while unknown (session or list pending). */
  favorited: boolean | null
  pending: boolean
  error: string | null
  toggle: () => void
}

export const FAVORITE_ERROR_MESSAGE = 'Não foi possível atualizar os favoritos. Tente novamente.'

/**
 * Heart state for one NFT. Guests are sent to `/login?redirect=<current>`.
 * Toggles of the same NFT run in order (scope), so the last click wins.
 */
export function useFavoriteToggle(nft: NftSummary): FavoriteToggle {
  const queryClient = useQueryClient()
  const manager = useSessionManager()
  const navigate = useNavigate()
  const href = useLocation({ select: (location) => location.href })
  const { userId, session, query } = useFavoritesList()
  const [error, setError] = useState<string | null>(null)
  const mutation = useMutation({ ...favoriteToggleOptions(queryClient, manager), scope: { id: `favorite:${nft.id}` } })

  const favorited = query.data ? query.data.items.some((item) => item.nftId === nft.id) : session === 'guest' ? false : null

  function toggle() {
    if (session === 'pending') return
    if (!userId) {
      void navigate({ to: '/login', search: loginSearch(href) })
      return
    }
    const list = queryClient.getQueryData<FavoriteList>(queryKeys.user.favorites(userId))
    if (!list) return
    setError(null)
    const next = !list.items.some((item) => item.nftId === nft.id)
    mutation.mutate(
      { userId, nft, favorite: next },
      {
        onError: (cause) => {
          if (!(cause instanceof FavoritesOwnerChangedError)) setError(FAVORITE_ERROR_MESSAGE)
        },
      },
    )
  }

  return { favorited, pending: mutation.isPending, error, toggle }
}
