import { Link } from '@tanstack/react-router'
import type { PurchaseActions } from '@/features/cart/use-purchase-actions'
import { cn } from '@/lib/utils'

/** Inline result of the last add (polite status / alert). */
export function PurchaseFeedback({ actions, className }: { actions: PurchaseActions; className?: string }) {
  const { feedback } = actions
  if (!feedback) return null
  if (feedback.tone === 'error') {
    return (
      <p role="alert" data-testid="add-to-cart-error" className={cn('text-[0.8125rem] text-destructive', className)}>
        {feedback.message}
      </p>
    )
  }
  return (
    <p role="status" data-testid="add-to-cart-success" className={cn('text-[0.8125rem] text-foreground', className)}>
      {feedback.message}{' '}
      <Link
        to="/carrinho"
        className="rounded-sm font-bold text-brand underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
      >
        Ver carrinho
      </Link>
    </p>
  )
}
