import type { RefObject } from 'react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useCatalogQuery, useUpdateCatalog } from '../use-catalog'
import { useCatalogResults } from '../use-catalog-results'
import { FilterPanel } from './filter-panel'
import { SortSelect } from './sort-select'

interface MobileFilterSheetContentProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The header button; focus returns there when the sheet closes. */
  returnFocusRef: RefObject<HTMLButtonElement | null>
}

/**
 * Bottom sheet with the desktop sidebar filters plus sort (lazy chunk).
 * Changes apply immediately (each is a URL navigation); the body and its
 * catalog query only mount while open and share the page's cache entry.
 */
export default function MobileFilterSheetContent({ open, onOpenChange, returnFocusRef }: MobileFilterSheetContentProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          returnFocusRef.current?.focus()
        }}
        className="max-h-[85svh] gap-0 overflow-y-auto rounded-t-[2rem] border-0 bg-card pb-[env(safe-area-inset-bottom)]"
      >
        <SheetHeader className="px-6 pt-6 pb-2">
          <SheetTitle className="text-lg font-bold tracking-[0.04em]">Filtros</SheetTitle>
          <SheetDescription className="sr-only">
            Filtre o catálogo por coleção, faixa de preço e rede. As alterações são aplicadas na hora.
          </SheetDescription>
        </SheetHeader>
        <FilterSheetBody />
      </SheetContent>
    </Sheet>
  )
}

function FilterSheetBody() {
  const query = useCatalogQuery()
  const update = useUpdateCatalog()
  const results = useCatalogResults(query)
  const total = results.current?.page.totalItems
  return (
    <>
      <div className="flex flex-col gap-6 px-3 pb-4">
        <SortSelect value={query.sort} onChange={(sort) => void update({ sort })} className="px-3" />
        <FilterPanel query={query} facets={results.latest?.facets} onChange={(patch) => void update(patch)} />
      </div>
      <div className="sticky bottom-0 bg-card px-6 pt-2 pb-6">
        <SheetClose asChild>
          <Button type="button" className="h-11 w-full rounded-sm font-bold tracking-[0.04em]">
            {total === undefined ? 'Ver resultados' : `Ver ${String(total)} resultados`}
          </Button>
        </SheetClose>
      </div>
    </>
  )
}
