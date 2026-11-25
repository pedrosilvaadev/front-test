import { queryOptions, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import type { ChangePasswordRequest, Profile, SessionInfo, UpdateAvatarRequest, UpdateProfileRequest } from '@/contracts'
import { isRetryableApiError } from '@/features/auth/session-bridge'
import type { SessionManager } from '@/features/auth/session-manager'
import { useSessionManager } from '@/features/auth/use-session'
import { tokenFor } from '@/features/favorites/favorites-queries'
import { queryKeys } from '@/lib/query-keys'

/**
 * Collector profile queries/mutations (P3-02, ADR-004). Requests carry the
 * token of the user the cache entry belongs to; results are written only if
 * that user is still signed in. A saved profile/avatar also patches the
 * `['session']` user so the header updates without a reload.
 */

const loadProfileApi = () => import('@/api/profile')
const retryTransient = (failureCount: number, error: unknown) => isRetryableApiError(error) && failureCount < 2

type Manager = Pick<SessionManager, 'getToken' | 'getUserId'>

export function profileQueryOptions(userId: string, manager: Manager) {
  return queryOptions({
    queryKey: queryKeys.user.profile(userId),
    queryFn: async ({ signal }) => (await loadProfileApi()).getProfile({ signal, token: tokenFor(manager, userId) }),
    staleTime: 30_000,
    retry: retryTransient,
  })
}

/** Writes a fresh profile to the cache and mirrors it into the session user. */
export function storeProfile(queryClient: QueryClient, manager: Manager, profile: Profile): void {
  if (manager.getUserId() !== profile.userId) return
  queryClient.setQueryData(queryKeys.user.profile(profile.userId), profile)
  queryClient.setQueryData<SessionInfo | null>(queryKeys.session(), (session) =>
    session && session.user.id === profile.userId
      ? {
          ...session,
          user: {
            ...session.user,
            displayName: profile.displayName,
            username: profile.username,
            email: profile.email,
            avatarUrl: profile.avatarUrl,
          },
        }
      : session,
  )
}

const PROFILE_SCOPE = { id: 'profile' }

export function useProfileMutations(userId: string) {
  const queryClient = useQueryClient()
  const manager = useSessionManager()
  const onProfile = (profile: Profile) => storeProfile(queryClient, manager, profile)

  const update = useMutation({
    mutationKey: ['profile', 'update'],
    scope: PROFILE_SCOPE,
    mutationFn: async (body: UpdateProfileRequest) =>
      (await loadProfileApi()).updateProfile(body, { token: tokenFor(manager, userId) }),
    onSuccess: onProfile,
  })
  const avatar = useMutation({
    mutationKey: ['profile', 'avatar'],
    scope: PROFILE_SCOPE,
    mutationFn: async (body: UpdateAvatarRequest | null) => {
      const api = await loadProfileApi()
      const token = tokenFor(manager, userId)
      return body ? api.updateAvatar(body, { token }) : api.removeAvatar({ token })
    },
    onSuccess: onProfile,
  })
  // Plaintext passwords live in the variables: never keep the mutation around.
  const password = useMutation({
    mutationKey: ['profile', 'password'],
    gcTime: 0,
    mutationFn: async (body: ChangePasswordRequest) =>
      (await loadProfileApi()).changePassword(body, { token: tokenFor(manager, userId) }),
  })
  return { update, avatar, password }
}
