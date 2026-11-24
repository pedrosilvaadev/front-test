import { LoaderCircle, X } from 'lucide-react'
import { useCallback, useRef, type ReactNode } from 'react'
import { DEFAULT_PAGE_SIZE } from '@/contracts/common/pagination'
import { cn } from '@/lib/utils'
import { CLEAR_FILTERS_PATCH, hasActiveFilters } from '../catalog-search'
import { useCatalogQuery, useUpdateCatalog } from '../use-catalog'
import { useCatalogResults } from '../use-catalog-results'
import { CatalogPagination } from './catalog-pagination'
import { CatalogEmptyState, CatalogErrorState, CatalogGridSkeleton } from './catalog-states'
import { CatalogTabs } from './catalog-tabs'
import { FilterPanel } from './filter-panel'
import { gridClass } from './grid-class'
import { NftCard } from './nft-card'
import { SortSelect } from './sort-select'

const CATALOG_RESULTS_ID = 'catalog-results'

/** Cards in the first row(s) load eagerly (largest above-the-fold images). */
const EAGER_CARDS = 3

function countLabel(total: number): string {
  return total === 1 ? '1 NFT encontrado' : `${String(total)} NFTs encontrados`
}

/**
 * Home catalog block (Figma "Início"): sidebar filters, tabs, sort, grid and
 * pagination. All state comes from the URL (`useCatalogQuery`) and every
 * change is a navigation (`useUpdateCatalog`), so refresh, sharing and
 * back/forward restore the exact view.
 */
export function CatalogSection() {
  const query = useCatalogQuery()
  const update = useUpdateCatalog()
  const results = useCatalogResults(query)
  const sectionRef = useRef<HTMLElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)

  const { current, latest } = results
  const totalPages = current?.page.totalPages ?? (results.isError ? 0 : (latest?.page.totalPages ?? 0))
  const skeletonCount = Math.min(query.pageSize, latest?.items.length || DEFAULT_PAGE_SIZE)
  const showUpdating = results.isUpdating && !results.isInitialLoading

  const goToResults = useCallback(() => {
    sectionRef.current?.scrollIntoView({ block: 'start' })
    resultsRef.current?.focus({ preventScroll: true })
  }, [])

  let status: string
  if (results.isError && !current) status = ''
  else if (current) {
    status = countLabel(current.page.totalItems)
    if (current.page.totalPages > 1) {
      status += `, página ${String(current.page.page)} de ${String(current.page.totalPages)}`
    }
  } else status = 'Carregando NFTs…'

  let content: ReactNode
  if (results.isError && !current) {
    content = <CatalogErrorState error={results.error} onRetry={results.retry} retrying={results.isFetching} />
  } else if (current && current.items.length === 0) {
    content = (
      <CatalogEmptyState
        pastLastPage={current.page.totalItems > 0}
        canClearFilters={hasActiveFilters(query)}
        onClearFilters={() => void update(CLEAR_FILTERS_PATCH)}
        onFirstPage={() => void update({ page: 1 })}
      />
    )
  } else if (current) {
    content = (
      <ul className={gridClass} aria-label="NFTs">
        {current.items.map((nft, index) => (
          <li key={nft.id}>
            <NftCard nft={nft} eager={index < EAGER_CARDS} />
          </li>
        ))}
      </ul>
    )
  } else {
    content = <CatalogGridSkeleton count={skeletonCount} />
  }

  return (
    <section
      ref={sectionRef}
      aria-labelledby="catalog-title"
      className="scroll-mt-4 md:grid md:grid-cols-[14rem_minmax(0,1fr)] md:items-start md:gap-x-8 lg:grid-cols-[19.375rem_minmax(0,1fr)] lg:gap-x-12"
    >
      <h2 id="catalog-title" className="sr-only">
        Catálogo de NFTs
      </h2>

      <aside aria-label="Filtros" className="hidden rounded-sm bg-card px-5 py-6 md:block">
        <FilterPanel query={query} facets={latest?.facets} onChange={(patch) => void update(patch)} />
      </aside>

      <div className="flex min-w-0 flex-col gap-6 md:gap-5">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <CatalogTabs
            value={query.tab}
            onChange={(tab) => void update({ tab })}
            controls={CATALOG_RESULTS_ID}
          />
          <SortSelect
            value={query.sort}
            onChange={(sort) => void update({ sort })}
            className="hidden md:flex"
          />
        </div>

        {query.q ? (
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>
              Resultados para <span className="font-bold text-foreground">“{query.q}”</span>
            </span>
            <button
              type="button"
              onClick={() => void update({ q: undefined })}
              className="inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-brand outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-3.5" aria-hidden="true" />
              Limpar busca
            </button>
          </div>
        ) : null}

        <p role="status" aria-live="polite" className="sr-only" data-testid="catalog-status">
          {status}
        </p>

        <div
          ref={resultsRef}
          id={CATALOG_RESULTS_ID}
          role="tabpanel"
          aria-labelledby={`catalog-tab-${query.tab}`}
          aria-busy={results.isFetching}
          tabIndex={-1}
          className="relative rounded-sm outline-none"
        >
          <div
            aria-hidden="true"
            data-testid="catalog-updating"
            className={cn(
              'pointer-events-none absolute -top-4 right-0 flex items-center gap-1.5 text-xs text-muted-foreground transition-opacity md:-top-3',
              showUpdating ? 'opacity-100' : 'opacity-0',
            )}
          >
            <LoaderCircle className="size-3.5 animate-spin" />
            Atualizando
          </div>
          {content}
        </div>

        {!results.isError || current ? (
          <CatalogPagination
            query={query}
            totalPages={totalPages}
            onNavigate={goToResults}
            className="mt-6 md:mt-10"
          />
        ) : null}
      </div>
    </section>
  )
}
