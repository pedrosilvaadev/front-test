/** Shared look of the signed-in account button (real trigger and its loading stand-in). */
export const accountButtonClass =
  'inline-flex h-[2.1875rem] max-w-[12rem] items-center gap-2 rounded-sm border border-border-accent px-1.5 pr-2.5 text-[0.9375rem] tracking-[0.04em] text-foreground outline-none hover:text-brand focus-visible:ring-2 focus-visible:ring-ring'

export function AccountButtonContent({ initials, displayName }: { initials: string; displayName: string }) {
  return (
    <>
      <span
        aria-hidden="true"
        className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-[0.6875rem] font-bold text-primary-foreground"
      >
        {initials}
      </span>
      <span className="truncate" data-testid="header-display-name">
        {displayName}
      </span>
    </>
  )
}
