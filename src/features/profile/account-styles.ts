import { cn } from '@/lib/utils'

/** Figma account forms (Perfil / Carteiras): 40px fields on desktop, 48px rounded on mobile. */
export const accountInputClass = cn(
  'h-12 w-full min-w-0 rounded-[0.625rem] border border-border bg-transparent px-4 text-sm tracking-[0.02em] text-foreground outline-none md:h-10 md:rounded-[0.125rem] md:text-[0.8125rem]',
  'placeholder:text-subtle-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/40',
  'aria-invalid:border-destructive disabled:opacity-60',
)

export const primaryButtonClass =
  'inline-flex h-10 items-center justify-center gap-2 rounded-sm bg-primary px-8 text-[0.8125rem] font-bold tracking-[0.04em] text-primary-foreground outline-none hover:bg-brand focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60'

export const linkButtonClass =
  'rounded-sm text-[0.9375rem] font-bold tracking-[0.04em] text-brand outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60'

/** Accessibility props linking a control to its `Field` error. */
export function errorProps(id: string, error: string | undefined) {
  return {
    id,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? `${id}-error` : undefined,
  } as const
}

