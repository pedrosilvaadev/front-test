import { Link, useRouterState } from '@tanstack/react-router'
import { LogOut } from 'lucide-react'
import { lazy, Suspense } from 'react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { loginSearch } from '../redirect'
import { initials, useSession } from '../use-session'
import { AccountButtonContent, accountButtonClass } from './account-button'

const AccountMenu = lazy(() => import('./account-menu'))

const entrarClass = 'h-[2.1875rem] rounded-sm px-2.5 text-[0.9375rem] font-medium tracking-[0.04em]'

/**
 * Header account control: "Entrar" (→ `/login?redirect=<current>`) for guests,
 * a user button with a Perfil/Sair menu when signed in (menu code loaded on
 * demand), and a placeholder of the same size while a stored session is
 * being revalidated.
 */
export function HeaderAccount() {
  const session = useSession()
  const href = useRouterState({ select: (state) => state.location.href })

  if (session.status === 'pending') {
    return (
      <Skeleton className="h-[2.1875rem] w-[5.5rem] rounded-sm bg-card" aria-hidden="true" data-testid="account-pending" />
    )
  }

  if (session.status === 'guest') {
    return (
      <Button asChild className={entrarClass}>
        <Link to="/login" search={loginSearch(href)}>
          <LogOut className="size-5" aria-hidden="true" />
          Entrar
        </Link>
      </Button>
    )
  }

  const { user } = session
  return (
    <Suspense
      fallback={
        // Same footprint, not interactive until the menu chunk arrives.
        <span aria-hidden="true" className={accountButtonClass}>
          <AccountButtonContent initials={initials(user.displayName)} displayName={user.displayName} />
        </span>
      }
    >
      <AccountMenu user={user} />
    </Suspense>
  )
}
