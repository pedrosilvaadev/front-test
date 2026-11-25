import { Link } from '@tanstack/react-router'
import { Heart, House, ScanLine, User } from 'lucide-react'
import { CartNavLink } from '@/features/cart/components/cart-chrome'
import { cn } from '@/lib/utils'
import { UNAVAILABLE_SUFFIX } from './planned-routes'

const itemClass =
  'relative flex size-11 items-center justify-center rounded-full text-muted-foreground outline-none hover:text-brand focus-visible:ring-2 focus-visible:ring-ring aria-[current=page]:text-brand'

/**
 * Fixed bottom navigation for viewports below `md` (Figma mobile "Início").
 * Height is `--tab-bar-height` plus the bottom safe-area inset; the layout
 * reserves the same space so content is never hidden behind it.
 */
export function MobileTabBar() {
  return (
    <nav
      aria-label="Principal"
      className="fixed inset-x-0 bottom-0 z-40 rounded-t-[2rem] bg-card pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_rgb(0_0_0/0.35)] md:hidden"
    >
      <ul className="mx-auto grid h-(--tab-bar-height) max-w-md grid-cols-5 items-center justify-items-center px-4">
        <li>
          <Link
            to="/"
            activeOptions={{ exact: true, includeSearch: false }}
            aria-label="Início"
            className={itemClass}
          >
            <House className="size-6 fill-current" aria-hidden="true" />
          </Link>
        </li>
        <li>
          {/* P3-02: private route; guests go to login and come back. */}
          <Link to="/favoritos" aria-label="Favoritos" className={itemClass}>
            <Heart className="size-6 fill-current" aria-hidden="true" />
          </Link>
        </li>
        <li className="relative -top-7">
          {/* Center action from the frame; its destination is not specified, so it is unavailable. */}
          <button
            type="button"
            aria-disabled="true"
            aria-label={`Escanear ${UNAVAILABLE_SUFFIX}`}
            title="Disponível em breve"
            className={cn(
              'flex size-16 cursor-not-allowed items-center justify-center rounded-full bg-linear-to-br from-primary to-[#a66d3c] text-foreground',
              'shadow-[0_0_0_6px_var(--background)] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-[6px] focus-visible:ring-offset-background',
            )}
          >
            <ScanLine className="size-7" aria-hidden="true" />
          </button>
        </li>
        <li>
          {/* P4-01: cart with the current owner's item count. */}
          <CartNavLink className={itemClass} badgeClassName="top-1 right-0.5" />
        </li>
        <li>
          {/* P3-01: guests are sent to login by the `_authed` guard and come back here. */}
          <Link to="/perfil" aria-label="Perfil" className={itemClass}>
            <User className="size-6 fill-current" aria-hidden="true" />
          </Link>
        </li>
      </ul>
    </nav>
  )
}
