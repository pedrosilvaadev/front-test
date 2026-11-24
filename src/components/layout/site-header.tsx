import { Link } from '@tanstack/react-router'
import { LogOut, Search, Settings2, ShoppingCart } from 'lucide-react'
import { useId } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { CartBadge } from './cart-badge'
import { cartLabel } from './cart-label'
import { PlannedRouteLink } from './planned-route-link'
import { PLANNED_ROUTES, UNAVAILABLE_SUFFIX } from './planned-routes'
import { UnavailableLink } from './unavailable-link'

const navItemClass = cn(
  'relative flex h-full items-start px-0.5 pt-[1.625rem] text-[0.9375rem] tracking-[0.04em] text-foreground',
  'after:absolute after:inset-x-0 after:bottom-0 after:h-[3px] after:rounded-full after:bg-primary after:opacity-0',
  'rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring',
  'aria-[current=page]:font-bold aria-[current=page]:text-brand aria-[current=page]:after:opacity-100',
)

const UNAVAILABLE_SECTIONS = ['Mercado', 'Criadores', 'Aprenda'] as const

interface SiteHeaderProps {
  /** Units in the cart; owned by the cart slice. Omitted → no badge. */
  cartCount?: number
}

export function SiteHeader({ cartCount }: SiteHeaderProps) {
  return (
    <header className="bg-background">
      <DesktopBar cartCount={cartCount} />
      <MobileSearchBar />
    </header>
  )
}

function DesktopBar({ cartCount }: SiteHeaderProps) {
  const searchHintId = useId()
  return (
    <div className="mx-auto hidden h-[4.25rem] w-full max-w-[75rem] items-stretch justify-between gap-4 border-b border-border px-6 md:flex xl:px-0">
      <div className="flex items-center pt-3.5 lg:flex-1">
        <Link
          to="/"
          className="rounded-sm text-sm font-bold tracking-[0.12em] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          KURIO
        </Link>
      </div>

      <nav aria-label="Principal" className="h-full xl:mr-10">
        <ul className="flex h-full gap-5 lg:gap-10">
          <li className="h-full">
            <Link
              to="/"
              activeOptions={{ exact: true, includeSearch: false }}
              className={navItemClass}
            >
              Início
            </Link>
          </li>
          {UNAVAILABLE_SECTIONS.map((label) => (
            <li key={label} className="h-full">
              <UnavailableLink className={navItemClass}>{label}</UnavailableLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="flex items-center justify-end gap-3 pt-3.5 lg:flex-1 lg:gap-5">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-disabled="true"
          aria-describedby={searchHintId}
          aria-label={`Buscar ${UNAVAILABLE_SUFFIX}`}
          title="Busca disponível em breve"
          className="cursor-not-allowed text-foreground opacity-70 hover:bg-transparent"
        >
          <Search className="size-6" strokeWidth={2.25} aria-hidden="true" />
        </Button>
        <span id={searchHintId} className="sr-only">
          A busca do catálogo estará disponível em breve.
        </span>

        <PlannedRouteLink
          to={PLANNED_ROUTES.cart}
          aria-label={cartLabel(cartCount)}
          className="relative inline-flex size-9 items-center justify-center rounded-md text-foreground outline-none hover:text-brand focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ShoppingCart className="size-6" aria-hidden="true" />
          <CartBadge count={cartCount} className="top-0.5 right-0" />
        </PlannedRouteLink>

        <Button asChild className="h-[2.1875rem] rounded-sm px-2.5 text-[0.9375rem] font-medium tracking-[0.04em]">
          <PlannedRouteLink to={PLANNED_ROUTES.login}>
            <LogOut className="size-5" aria-hidden="true" />
            Entrar
          </PlannedRouteLink>
        </Button>
      </div>
    </div>
  )
}

/**
 * Mobile (< md) top bar from the "Início" mobile frame: search field and
 * filter button. Both drive catalog state that ships in P2-02, so they are
 * exposed as unavailable instead of accepting input that would do nothing.
 */
function MobileSearchBar() {
  const searchId = useId()
  const hintId = useId()
  return (
    <div className="flex items-center gap-2.5 px-6 pt-6 pb-2 md:hidden">
      <form role="search" aria-label="Explorar coleções" className="min-w-0 flex-1" onSubmit={(e) => e.preventDefault()}>
        <label htmlFor={searchId} className="sr-only">
          Explorar coleções {UNAVAILABLE_SUFFIX}
        </label>
        <div className="flex h-11 items-center gap-2.5 rounded-xl bg-card px-3.5 focus-within:ring-2 focus-within:ring-ring">
          <Search className="size-5 shrink-0 text-subtle-foreground" aria-hidden="true" />
          <input
            id={searchId}
            type="search"
            readOnly
            aria-disabled="true"
            aria-describedby={hintId}
            placeholder="Explorar coleções"
            className="min-w-0 flex-1 cursor-not-allowed bg-transparent text-[0.9375rem] font-bold tracking-[0.04em] text-foreground outline-none placeholder:text-subtle-foreground"
          />
        </div>
        <span id={hintId} className="sr-only">
          A busca do catálogo estará disponível em breve.
        </span>
      </form>
      <button
        type="button"
        aria-disabled="true"
        aria-label={`Filtros ${UNAVAILABLE_SUFFIX}`}
        title="Filtros disponíveis em breve"
        className="flex size-11 shrink-0 cursor-not-allowed items-center justify-center rounded-xl bg-linear-to-br from-primary to-[#a66d3c] text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <Settings2 className="size-5" aria-hidden="true" />
      </button>
    </div>
  )
}
