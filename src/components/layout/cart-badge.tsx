import { cn } from '@/lib/utils'

interface CartBadgeProps {
  /** Number of units in the cart. `undefined` (unknown/not loaded) or 0 renders nothing. */
  count?: number
  className?: string
}

/**
 * Visual count bubble on the cart icon. The count is supplied by the cart
 * slice (P4); until then the shell passes nothing and no number is shown.
 * Decorative: the owning link exposes the count in its accessible name.
 */
export function CartBadge({ count, className }: CartBadgeProps) {
  if (count === undefined || count <= 0) return null
  return (
    <span
      aria-hidden="true"
      data-slot="cart-badge"
      className={cn(
        'absolute -top-1.5 -right-2 flex size-4 items-center justify-center rounded-full bg-primary text-[0.625rem] leading-none font-bold text-primary-foreground',
        className,
      )}
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}
