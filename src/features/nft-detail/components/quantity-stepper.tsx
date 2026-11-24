import { Minus, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PurchaseSelection } from '../purchase-selection'

interface QuantityStepperProps {
  selection: PurchaseSelection
  /** Distinguishes the desktop and mobile instances (ids/test hooks). */
  className?: string
  size?: 'md' | 'sm'
}

/**
 * "− 1 +" stepper (Figma). Bounds come from the selected edition
 * (1 … min(available, maxPerOrder)); buttons are disabled at the bounds and
 * the whole control is disabled when the edition is sold out.
 */
export function QuantityStepper({ selection, className, size = 'md' }: QuantityStepperProps) {
  const { quantity, canDecrement, canIncrement, decrement, increment, bounds, soldOut } = selection
  const buttonClass = cn(
    'inline-flex shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground outline-none transition-colors',
    'hover:bg-brand focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-primary',
    size === 'md' ? 'h-10 w-7' : 'h-7 w-5',
  )
  return (
    <div role="group" aria-label="Quantidade" className={cn('flex items-center gap-3', className)} data-testid="quantity-stepper">
      <button type="button" aria-label="Diminuir quantidade" disabled={!canDecrement} onClick={decrement} className={buttonClass}>
        <Minus className={size === 'md' ? 'size-5' : 'size-4'} aria-hidden="true" strokeWidth={3} />
      </button>
      <output
        aria-live="polite"
        aria-label={soldOut ? 'Quantidade indisponível' : `Quantidade: ${String(quantity)} de no máximo ${String(bounds.max)}`}
        className={cn('min-w-5 text-center tabular-nums text-foreground', size === 'md' ? 'text-lg' : 'text-xl font-bold')}
        data-testid="quantity-value"
      >
        {quantity}
      </output>
      <button type="button" aria-label="Aumentar quantidade" disabled={!canIncrement} onClick={increment} className={buttonClass}>
        <Plus className={size === 'md' ? 'size-5' : 'size-4'} aria-hidden="true" strokeWidth={3} />
      </button>
    </div>
  )
}
