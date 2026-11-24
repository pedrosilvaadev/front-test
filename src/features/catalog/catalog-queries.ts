import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import { isApiError } from '@/api/errors'
import { listNfts } from '@/api/nfts'
import type { CatalogQuery } from '@/contracts'
import { queryKeys } from '@/lib/query-keys'

/** Catalog lists are public and change rarely (ADR-004: catalog staleTime 30 s). */
export const CATALOG_STALE_TIME_MS = 30_000

/** Retry once, and only for transient/network/timeout failures (ADR-004). */
export function shouldRetryCatalog(failureCount: number, error: unknown): boolean {
  return failureCount < 1 && isApiError(error) && error.retryable
}

/**
 * `GET /api/nfts` for a normalized query. The AbortSignal is forwarded to
 * Axios, so a query that loses its observers (the URL moved on) cancels its
 * request. `keepPreviousData` keeps sidebar facets and pagination on screen
 * while the next page/filter loads; the grid itself only renders a response
 * whose echoed `query` matches the URL (see `useCatalogResults`).
 */
export function catalogListQueryOptions(query: CatalogQuery) {
  return queryOptions({
    queryKey: queryKeys.catalog.list(query),
    queryFn: ({ signal }) => listNfts(query, { signal }),
    placeholderData: keepPreviousData,
    staleTime: CATALOG_STALE_TIME_MS,
    retry: shouldRetryCatalog,
  })
}
