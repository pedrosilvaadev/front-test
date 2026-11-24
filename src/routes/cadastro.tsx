import { createFileRoute } from '@tanstack/react-router'
import { redirectSignedIn } from '@/features/auth/guards'
import { validateAuthSearch } from '@/features/auth/redirect'
import { AuthScreen } from '@/features/auth/components/auth-screen'

/** `/cadastro?redirect=<path>`: registration; same redirect rules as `/login`. */
export const Route = createFileRoute('/cadastro')({
  validateSearch: validateAuthSearch,
  beforeLoad: ({ context: { session }, search }) => redirectSignedIn(session, search),
  component: RegisterRoute,
})

function RegisterRoute() {
  const search = Route.useSearch()
  return <AuthScreen mode="register" search={search} />
}
