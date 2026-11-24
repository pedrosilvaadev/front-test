import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { loginSearch } from '@/features/auth/redirect'
import { AuthedError, AuthedPending } from '@/features/auth/components/authed-states'

/**
 * Pathless layout guarding private routes (`/perfil`, later favorites,
 * checkout...). Every navigation into it revalidates the session with the
 * server (`GET /api/auth/session`) before any private content renders; a
 * guest or a lost session is redirected to `/login?redirect=<url>` (with
 * `reason=expired` when a valid session expired meanwhile).
 */
export const Route = createFileRoute('/_authed')({
  beforeLoad: async ({ context: { session }, location }) => {
    const info = await session.revalidateSession()
    if (!info) {
      const reason = session.takeEndReason() === 'expired' ? 'expired' : undefined
      throw redirect({ to: '/login', search: loginSearch(location.href, reason), replace: true })
    }
    return { user: info.user }
  },
  // Keep the guard UI out of the entry chunk (only `beforeLoad` must be eager).
  codeSplitGroupings: [['component'], ['pendingComponent', 'errorComponent']],
  pendingComponent: AuthedPending,
  errorComponent: AuthedError,
  component: Outlet,
})
