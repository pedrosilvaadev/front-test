import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Network, Wallet, WalletInput, WalletSlot, WalletsResponse } from '@/contracts'
import { isRetryableApiError } from '@/features/auth/session-bridge'
import type { SessionManager } from '@/features/auth/session-manager'
import { useSessionManager } from '@/features/auth/use-session'
import { tokenFor } from '@/features/favorites/favorites-queries'
import { queryKeys } from '@/lib/query-keys'

/**
 * Wallets page queries/mutations (P3-02). Same cache entry as checkout
 * (`['user', userId, 'wallets']`, ADR-004); requests carry that user's token
 * and results are only written while the same user is signed in.
 */

const loadWalletsApi = () => import('@/api/wallets')
const retryTransient = (failureCount: number, error: unknown) => isRetryableApiError(error) && failureCount < 2

type Manager = Pick<SessionManager, 'getToken' | 'getUserId'>

export function walletsPageQueryOptions(userId: string, manager: Manager) {
  return queryOptions({
    queryKey: queryKeys.user.wallets(userId),
    queryFn: async ({ signal }) => (await loadWalletsApi()).getWallets({ signal, token: tokenFor(manager, userId) }),
    staleTime: 15_000,
    retry: retryTransient,
  })
}

export function useWalletMutations(userId: string, slot: WalletSlot) {
  const queryClient = useQueryClient()
  const manager = useSessionManager()
  const queryKey = queryKeys.user.wallets(userId)
  const scope = { id: `wallet:${slot}` }

  const patch = (wallet: Wallet) => {
    if (manager.getUserId() !== userId) return
    queryClient.setQueryData<WalletsResponse>(queryKey, (current) =>
      current ? { ...current, [wallet.slot]: wallet } : current,
    )
  }
  const refresh = () => {
    if (manager.getUserId() === userId) void queryClient.invalidateQueries({ queryKey })
  }

  const save = useMutation({
    mutationKey: ['wallets', 'save', slot],
    scope,
    mutationFn: async (body: WalletInput) => (await loadWalletsApi()).putWallet(slot, body, { token: tokenFor(manager, userId) }),
    onSuccess: patch,
    onSettled: refresh,
  })
  const connect = useMutation({
    mutationKey: ['wallets', 'connect', slot],
    scope,
    mutationFn: async (network: Network) =>
      (await loadWalletsApi()).connectWallet(slot, network, { token: tokenFor(manager, userId) }),
    onSettled: refresh,
  })
  const disconnect = useMutation({
    mutationKey: ['wallets', 'disconnect', slot],
    scope,
    mutationFn: async () => (await loadWalletsApi()).disconnectWallet(slot, { token: tokenFor(manager, userId) }),
    onSettled: refresh,
  })
  return { save, connect, disconnect }
}
