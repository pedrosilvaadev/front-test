import type * as React from 'react'
import { cn } from '@/lib/utils'
import { UNAVAILABLE_SUFFIX } from './planned-routes'

interface UnavailableLinkProps extends Omit<React.ComponentProps<'a'>, 'href' | 'onClick'> {
  children: React.ReactNode
}

/**
 * Entry point for a section that is not part of this release (Mercado,
 * Criadores, editorial, support, social...). It stays focusable and
 * discoverable, is announced as a disabled link, and never navigates or
 * pretends to succeed.
 */
export function UnavailableLink({ children, className, title, ...props }: UnavailableLinkProps) {
  return (
    <a
      role="link"
      aria-disabled="true"
      tabIndex={0}
      title={title ?? 'Disponível em breve'}
      data-unavailable=""
      className={cn('cursor-not-allowed opacity-70', className)}
      onClick={(event) => event.preventDefault()}
      {...props}
    >
      {children}
      <span className="sr-only"> {UNAVAILABLE_SUFFIX}</span>
    </a>
  )
}
