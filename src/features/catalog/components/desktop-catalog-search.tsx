import { Search, X } from 'lucide-react'
import { useId, useRef, useState, type KeyboardEvent } from 'react'
import { cn } from '@/lib/utils'
import { useCatalogSearchField } from '../use-catalog-search-field'

/**
 * Desktop/tablet header search (Figma: magnifier icon next to the cart).
 * The icon toggles an inline field bound to the catalog `?q=` through the
 * same debounced, route-safe logic as the mobile field; it works from any
 * route (navigates to `/` with `q`). The field stays open while a search is
 * active; Escape closes an empty field and returns focus to the toggle.
 */
export function DesktopCatalogSearch() {
  const inputId = useId()
  const field = useCatalogSearchField()
  const [expanded, setExpanded] = useState(false)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const open = expanded || field.value !== ''

  function close() {
    setExpanded(false)
    toggleRef.current?.focus()
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Escape') return
    event.preventDefault()
    if (field.value !== '') field.onChange('')
    close()
  }

  return (
    <form
      role="search"
      aria-label="Buscar NFTs"
      className="flex items-center gap-1"
      onSubmit={(event) => {
        event.preventDefault()
        field.submit()
      }}
    >
      {open ? (
        <div className="flex h-9 w-44 items-center gap-1.5 rounded-sm border border-input bg-card px-2.5 focus-within:ring-2 focus-within:ring-ring lg:w-56">
          <label htmlFor={inputId} className="sr-only">
            Buscar NFTs
          </label>
          <input
            id={inputId}
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            maxLength={100}
            // Opened by an explicit click on the toggle: move focus into the field.
            autoFocus={expanded}
            value={field.value}
            onChange={(event) => field.onChange(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Buscar NFTs"
            className="min-w-0 flex-1 bg-transparent text-sm tracking-[0.02em] text-foreground outline-none placeholder:text-subtle-foreground [&::-webkit-search-cancel-button]:hidden"
          />
          {field.value !== '' ? (
            <button
              type="button"
              aria-label="Limpar busca"
              onClick={() => field.onChange('')}
              className="rounded-sm text-muted-foreground outline-none hover:text-brand focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      ) : null}
      <button
        ref={toggleRef}
        type="button"
        aria-label="Buscar"
        aria-expanded={open}
        aria-controls={open ? inputId : undefined}
        onClick={() => {
          if (!open) setExpanded(true)
          else if (field.value === '') close()
          else field.submit()
        }}
        className={cn(
          'inline-flex size-9 items-center justify-center rounded-md text-foreground outline-none hover:text-brand focus-visible:ring-2 focus-visible:ring-ring',
          open && 'text-brand',
        )}
      >
        <Search className="size-6" strokeWidth={2.25} aria-hidden="true" />
      </button>
    </form>
  )
}
