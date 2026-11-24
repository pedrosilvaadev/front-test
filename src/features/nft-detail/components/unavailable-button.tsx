import type * as React from 'react'
import { UNAVAILABLE_SUFFIX } from '@/components/layout/planned-routes'
import { cn } from '@/lib/utils'

interface UnavailableButtonProps extends Omit<React.ComponentProps<'button'>, 'onClick' | 'type' | 'disabled'> {
  /** Accessible name for icon-only buttons; the "(em breve)" suffix is appended. */
  label?: string
}

/**
 * Action owned by a later slice (COMPRAR → P4-01, Favoritar → P3-02, cart).
 * Same contract as `UnavailableLink`: focusable, announced as disabled,
 * "(em breve)" in the accessible name, and clicking does nothing (no fake
 * success, no request).
 */
export function UnavailableButton({ label, children, className, title, ...props }: UnavailableButtonProps) {
  return (
    <button
      type="button"
      aria-disabled="true"
      aria-label={label ? `${label} ${UNAVAILABLE_SUFFIX}` : undefined}
      title={title ?? 'Disponível em breve'}
      data-unavailable=""
      onClick={(event) => event.preventDefault()}
      className={cn('cursor-not-allowed opacity-70', className)}
      {...props}
    >
      {children}
      {label ? null : <span className="sr-only"> {UNAVAILABLE_SUFFIX}</span>}
    </button>
  )
}
