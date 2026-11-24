import { Link } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { CatalogQuery } from '@/contracts'
import { cn } from '@/lib/utils'
import { toCatalogSearch } from '../catalog-search'
import { pageItems } from '../pagination'

interface CatalogPaginationProps {
  query: CatalogQuery
  totalPages: number
  /** Called after a page link is activated (moves focus/scroll to the results). */
  onNavigate?: () => void
  className?: string
}

const itemClass =
  'flex size-9 items-center justify-center rounded-sm border border-border text-sm text-foreground tabular-nums outline-none transition-colors hover:border-primary hover:text-brand focus-visible:ring-2 focus-visible:ring-ring'

/**
 * Numbered pagination with next (Figma "Início"). Real links (`?page=n`), so
 * pages are shareable, open in new tabs and work with back/forward.
 */
export function CatalogPagination({ query, totalPages, onNavigate, className }: CatalogPaginationProps) {
  if (totalPages <= 1) return null
  const page = Math.min(query.page, totalPages)
  const hrefFor = (target: number) => toCatalogSearch({ ...query, page: target })

  return (
    <nav aria-label="Paginação" className={cn('flex justify-end', className)}>
      <ul className="flex flex-wrap items-center gap-2">
        {page > 1 ? (
          <li>
            <Link
              to="/"
              search={hrefFor(page - 1)}
              resetScroll={false}
              activeOptions={{ exact: true, includeSearch: true }}
              onClick={onNavigate}
              aria-label="Página anterior"
              className={itemClass}
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
            </Link>
          </li>
        ) : null}
        {pageItems(page, totalPages).map((item) =>
          typeof item === 'number' ? (
            <li key={item}>
              <Link
                to="/"
                search={hrefFor(item)}
                resetScroll={false}
                onClick={onNavigate}
                aria-label={`Página ${String(item)}`}
                aria-current={item === query.page ? 'page' : undefined}
                activeOptions={{ exact: true, includeSearch: true }}
                className={cn(
                  itemClass,
                  'aria-[current=page]:border-primary aria-[current=page]:bg-primary aria-[current=page]:font-bold aria-[current=page]:text-primary-foreground',
                )}
              >
                {item}
              </Link>
            </li>
          ) : (
            <li key={item} aria-hidden="true" className="px-1 text-muted-foreground">
              …
            </li>
          ),
        )}
        <li>
          {page < totalPages ? (
            <Link
              to="/"
              search={hrefFor(page + 1)}
              resetScroll={false}
              activeOptions={{ exact: true, includeSearch: true }}
              onClick={onNavigate}
              aria-label="Próxima página"
              className={itemClass}
            >
              <ChevronRight className="size-4" aria-hidden="true" />
            </Link>
          ) : (
            <span aria-disabled="true" aria-label="Próxima página" role="link" className={cn(itemClass, 'opacity-40')}>
              <ChevronRight className="size-4" aria-hidden="true" />
            </span>
          )}
        </li>
      </ul>
    </nav>
  )
}
