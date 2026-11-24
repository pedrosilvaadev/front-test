import { Link } from '@tanstack/react-router'
import { LogOut, ShoppingCart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DesktopCatalogSearch } from '@/features/catalog/components/desktop-catalog-search'
import { MobileCatalogSearch, MobileFilterSheet } from '@/features/catalog/components/mobile-catalog-controls'
import { cn } from '@/lib/utils'
import { CartBadge } from './cart-badge'
import { cartLabel } from './cart-label'
import { PlannedRouteLink } from './planned-route-link'
import { PLANNED_ROUTES } from './planned-routes'
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
        {/* P2-02: catalog search bound to ?q= (debounced, works from any route). */}
        <DesktopCatalogSearch />

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
 * Mobile (< md) top bar from the "Início" mobile frame: search field wired to
 * the catalog `?q=` (debounced) and the filter button that opens the catalog
 * filter sheet (P2-02).
 */
function MobileSearchBar() {
  return (
    <div className="flex items-center gap-2.5 px-6 pt-6 pb-2 md:hidden">
      <MobileCatalogSearch />
      <MobileFilterSheet />
    </div>
  )
}
