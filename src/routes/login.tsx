import { createFileRoute } from '@tanstack/react-router'
import { redirectSignedIn } from '@/features/auth/guards'
import { validateAuthSearch } from '@/features/auth/redirect'
import { AuthScreen } from '@/features/auth/components/auth-screen'

/**
 * `/login?redirect=<path>&reason=expired`. The redirect is sanitized in
 * `validateSearch` (same-origin relative paths only); signed-in visitors are
 * sent straight to it.
 */
export const Route = createFileRoute('/login')({
  validateSearch: validateAuthSearch,
  beforeLoad: ({ context: { session }, search }) => redirectSignedIn(session, search),
  component: LoginRoute,
})

function LoginRoute() {
  const search = Route.useSearch()
  return <AuthScreen mode="login" search={search} />
}
