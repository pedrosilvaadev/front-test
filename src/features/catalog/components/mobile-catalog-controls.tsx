import { Search, Settings2 } from 'lucide-react'
import { lazy, Suspense, useId, useRef, useState } from 'react'
import { hasActiveFilters } from '../catalog-search'
import { useCatalogQuery } from '../use-catalog'
import { useCatalogSearchField } from '../use-catalog-search-field'

/**
 * Mobile "Explorar coleções" field (Figma mobile "Início"), wired to `?q=`
 * through `useCatalogSearchField` (debounced, route-safe; see there).
 */
export function MobileCatalogSearch() {
  const inputId = useId()
  const field = useCatalogSearchField()
  return (
    <form
      role="search"
      aria-label="Explorar coleções"
      className="min-w-0 flex-1"
      onSubmit={(event) => {
        event.preventDefault()
        field.submit()
      }}
    >
      <label htmlFor={inputId} className="sr-only">
        Explorar coleções
      </label>
      <div className="flex h-11 items-center gap-2.5 rounded-xl bg-card px-3.5 focus-within:ring-2 focus-within:ring-ring">
        <Search className="size-5 shrink-0 text-subtle-foreground" aria-hidden="true" />
        <input
          id={inputId}
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          maxLength={100}
          value={field.value}
          onChange={(event) => field.onChange(event.target.value)}
          placeholder="Explorar coleções"
          className="min-w-0 flex-1 bg-transparent text-[0.9375rem] font-bold tracking-[0.04em] text-foreground outline-none placeholder:text-subtle-foreground [&::-webkit-search-cancel-button]:hidden"
        />
      </div>
    </form>
  )
}

const MobileFilterSheetContent = lazy(() => import('./mobile-filter-sheet'))

/**
 * Mobile filter button (header). The sheet with the filters, sort and its
 * catalog query is a separate chunk loaded on first use (warmed on
 * focus/touch), so the header stays light on every route.
 */
export function MobileFilterSheet() {
  const query = useCatalogQuery()
  const active = hasActiveFilters(query)
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const warm = () => void import('./mobile-filter-sheet')
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={active ? 'Filtros (ativos)' : 'Filtros'}
        aria-haspopup="dialog"
        aria-expanded={open}
        onFocus={warm}
        onPointerEnter={warm}
        onTouchStart={warm}
        onClick={() => {
          setLoaded(true)
          setOpen(true)
        }}
        className="relative flex size-11 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-primary to-[#a66d3c] text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <Settings2 className="size-5" aria-hidden="true" />
        {active ? (
          <span
            aria-hidden="true"
            className="absolute top-1.5 right-1.5 size-2 rounded-full bg-foreground ring-2 ring-primary"
          />
        ) : null}
      </button>
      {loaded ? (
        <Suspense fallback={null}>
          <MobileFilterSheetContent open={open} onOpenChange={setOpen} returnFocusRef={triggerRef} />
        </Suspense>
      ) : null}
    </>
  )
}
