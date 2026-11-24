import { Link } from '@tanstack/react-router'
import { lazy, Suspense } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { DesktopCatalogSearch } from '@/features/catalog/components/desktop-catalog-search'
import { MobileCatalogSearch, MobileFilterSheet } from '@/features/catalog/components/mobile-catalog-controls'
import { CartMergeNotice, CartNavLink } from '@/features/cart/components/cart-chrome'
import { cn } from '@/lib/utils'
import { UnavailableLink } from './unavailable-link'

const navItemClass = cn(
  'relative flex h-full items-start px-0.5 pt-[1.625rem] text-[0.9375rem] tracking-[0.04em] text-foreground',
  'after:absolute after:inset-x-0 after:bottom-0 after:h-[3px] after:rounded-full after:bg-primary after:opacity-0',
  'rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring',
  'aria-[current=page]:font-bold aria-[current=page]:text-brand aria-[current=page]:after:opacity-100',
)

/**
 * Account control (P3-01) in its own chunk: it observes the session query
 * (`useQuery`) and pulls the auth module, which would otherwise grow the entry
 * chunk. The import starts when this module loads (while MSW boots), so it is
 * normally ready before the first render.
 */
const loadHeaderAccount = () =>
  import('@/features/auth/components/user-menu').then((module) => ({ default: module.HeaderAccount }))
const accountChunk = loadHeaderAccount()
const HeaderAccount = lazy(() => accountChunk)

const UNAVAILABLE_SECTIONS = ['Mercado', 'Criadores', 'Aprenda'] as const

/** Header; also hosts the guest-cart merge notice (P4-01), shown after sign-in on any route. */
export function SiteHeader() {
  return (
    <>
      <header className="bg-background">
        <DesktopBar />
        <MobileSearchBar />
      </header>
      <CartMergeNotice />
    </>
  )
}

function DesktopBar() {
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

        {/* P4-01: cart link with the current owner's item count. */}
        <CartNavLink
          className="relative inline-flex size-9 items-center justify-center rounded-md text-foreground outline-none hover:text-brand focus-visible:ring-2 focus-visible:ring-ring aria-[current=page]:text-brand"
          badgeClassName="top-0.5 right-0"
        />

        {/* P3-01: "Entrar" for guests, account menu (Perfil, Sair) when signed in. */}
        <Suspense
          fallback={<Skeleton className="h-[2.1875rem] w-[5.5rem] rounded-sm bg-card" aria-hidden="true" />}
        >
          <HeaderAccount />
        </Suspense>
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
