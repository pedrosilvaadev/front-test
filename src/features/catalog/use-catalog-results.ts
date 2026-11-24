import { useQuery } from '@tanstack/react-query'
import { useCallback } from 'react'
import type { CatalogQuery, NftListResponse } from '@/contracts/nfts'
import { catalogListQueryOptions } from './catalog-queries'
import { isSameCatalogQuery } from './catalog-search'

export interface CatalogResults {
  /** Response for exactly the current URL query; `undefined` while it is loading or failed. */
  current: NftListResponse | undefined
  /** Latest available response (may belong to the previous query): facets and page meta only. */
  latest: NftListResponse | undefined
  isInitialLoading: boolean
  /** A request for the current query is in flight while older/same data is shown. */
  isUpdating: boolean
  /** Any request for the current query is in flight (including a manual retry after an error). */
  isFetching: boolean
  error: unknown
  isError: boolean
  retry: () => void
}

/**
 * Catalog list for the given query. Out-of-order guard: besides Query's
 * per-key caching and request cancellation, a response is only treated as
 * current when its echoed `query` equals the URL query, so a late response
 * for an older query can never populate the grid.
 */
export function useCatalogResults(query: CatalogQuery): CatalogResults {
  const result = useQuery(catalogListQueryOptions(query))
  const { data, isPlaceholderData, isPending, isFetching, isError, error, refetch } = result
  // Design choice: while the next query loads, `keepPreviousData` keeps the
  // previous response only for facets and pagination (stable sidebar, no
  // layout jump); the grid shows skeletons instead of the previous items, so
  // results for an older query are never presented as if they matched the
  // current URL (README §3 "descartar respostas obsoletas").
  const current =
    data !== undefined && !isPlaceholderData && isSameCatalogQuery(data.query, query) ? data : undefined
  const retry = useCallback(() => {
    void refetch()
  }, [refetch])
  return {
    current,
    latest: data,
    isInitialLoading: isPending && data === undefined,
    isUpdating: isFetching && !isError,
    isFetching,
    error,
    isError,
    retry,
  }
}
