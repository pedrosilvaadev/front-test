import { Link } from '@tanstack/react-router'
import { ShoppingCart } from 'lucide-react'
import { lazy, Suspense } from 'react'
import { cartLabel } from '@/components/layout/cart-label'

/**
 * Entry-chunk wrappers for the cart chrome (header/tab bar link with count,
 * merge notice). The real components observe the cart query (react-query
 * hooks, mutations module), so they load in their own chunk, started when
 * this module loads; until then a plain cart link without a count is shown.
 */
const chunk = import('./cart-chrome-impl')
const LazyCartNavLink = lazy(() => chunk.then((module) => ({ default: module.CartNavLink })))
const LazyCartMergeNotice = lazy(() => chunk.then((module) => ({ default: module.CartMergeNotice })))

interface CartNavLinkProps {
  className?: string
  badgeClassName?: string
}

export function CartNavLink(props: CartNavLinkProps) {
  return (
    <Suspense
      fallback={
        <Link to="/carrinho" aria-label={cartLabel()} className={props.className} data-testid="cart-nav-link">
          <ShoppingCart className="size-6" aria-hidden="true" />
        </Link>
      }
    >
      <LazyCartNavLink {...props} />
    </Suspense>
  )
}

export function CartMergeNotice() {
  return (
    <Suspense fallback={null}>
      <LazyCartMergeNotice />
    </Suspense>
  )
}
