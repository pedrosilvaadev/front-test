import { queryOptions } from '@tanstack/react-query'
import { isRetryableApiError } from '@/features/auth/session-bridge'
import type { SessionManager } from '@/features/auth/session-manager'
import { tokenFor } from '@/features/favorites/favorites-queries'
import { queryKeys } from '@/lib/query-keys'

const loadWalletsApi = () => import('@/api/wallets')
const loadOrdersApi = () => import('@/api/orders')

const retryTransient = (failureCount: number, error: unknown) => isRetryableApiError(error) && failureCount < 2

/**
 * `['user', userId, 'wallets']` (private, ADR-004). The request carries that
 * user's token (`tokenFor`), so a refetch racing a user switch can never write
 * another user's wallets under this key (same rule as the wallets page).
 */
export function walletsQueryOptions(userId: string, manager: Pick<SessionManager, 'getToken' | 'getUserId'>) {
  return queryOptions({
    queryKey: queryKeys.user.wallets(userId),
    queryFn: async ({ signal }) => (await loadWalletsApi()).getWallets({ signal, token: tokenFor(manager, userId) }),
    staleTime: 15_000,
    retry: retryTransient,
  })
}

/** Polling delay while an order is pending: 1s, 2s, 4s, then every 5s (backoff). */
export function pendingPollDelay(polls: number): number {
  return Math.min(1000 * 2 ** Math.max(0, polls), 5000)
}

/** `['user', userId, 'orders', orderId]`; polls with backoff until the order is terminal. */
export function orderQueryOptions(userId: string, orderId: string) {
  return queryOptions({
    queryKey: queryKeys.user.order(userId, orderId),
    queryFn: async ({ signal }) => (await loadOrdersApi()).getOrder(orderId, { signal }),
    staleTime: 0,
    retry: retryTransient,
    refetchInterval: (query) => {
      const order = query.state.data
      if (!order || order.status !== 'pending') return false
      return pendingPollDelay(query.state.dataUpdateCount - 1)
    },
    refetchIntervalInBackground: false,
  })
}

export { loadOrdersApi, loadWalletsApi }
