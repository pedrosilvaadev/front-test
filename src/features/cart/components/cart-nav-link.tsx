import { Link } from '@tanstack/react-router'
import { ShoppingCart } from 'lucide-react'
import { CartBadge } from '@/components/layout/cart-badge'
import { cartLabel } from '@/components/layout/cart-label'
import { useCart } from '../cart-queries'

interface CartNavLinkProps {
  className?: string
  badgeClassName?: string
}

/**
 * Cart entry point (header and mobile tab bar): links to `/carrinho` and
 * shows the cart's `itemCount` (units) for the current owner. Part of the
 * entry chunk: the cart API module is only loaded when a cart exists.
 */
export function CartNavLink({ className, badgeClassName }: CartNavLinkProps) {
  const { itemCount } = useCart()
  return (
    <Link to="/carrinho" aria-label={cartLabel(itemCount)} className={className} data-testid="cart-nav-link">
      <ShoppingCart className="size-6" aria-hidden="true" />
      <CartBadge count={itemCount} className={badgeClassName} />
    </Link>
  )
}
