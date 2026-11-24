import { queryOptions, type QueryClient } from '@tanstack/react-query'
import { isApiError } from '@/api/errors'
import { getNft, getRelatedNfts } from '@/api/nfts'
import { queryKeys } from '@/lib/query-keys'
import { CATALOG_STALE_TIME_MS, shouldRetryCatalog } from '../catalog/catalog-queries'

/**
 * `GET /api/nfts/:idOrSlug`. Public resource (ADR-004 `['catalog', 'detail', idOrSlug]`);
 * the AbortSignal is forwarded so leaving the page cancels the request.
 * Retries once only for transient/network/timeout errors, so a 404 fails fast.
 */
export function nftDetailQueryOptions(idOrSlug: string) {
  return queryOptions({
    queryKey: queryKeys.catalog.detail(idOrSlug),
    queryFn: ({ signal }) => getNft(idOrSlug, { signal }),
    staleTime: CATALOG_STALE_TIME_MS,
    retry: shouldRetryCatalog,
  })
}

/** `GET /api/nfts/:idOrSlug/related` ("Mais desta coleção"). */
export function relatedNftsQueryOptions(idOrSlug: string) {
  return queryOptions({
    queryKey: queryKeys.catalog.related(idOrSlug),
    queryFn: ({ signal }) => getRelatedNfts(idOrSlug, { signal }),
    staleTime: CATALOG_STALE_TIME_MS,
    retry: shouldRetryCatalog,
  })
}

/** Starts the detail + related requests without awaiting or throwing (route loader / intent preload). */
export function prefetchNftDetail(queryClient: QueryClient, idOrSlug: string): void {
  void queryClient.prefetchQuery(nftDetailQueryOptions(idOrSlug))
  void queryClient.prefetchQuery(relatedNftsQueryOptions(idOrSlug))
}

export type DetailFailure = 'not-found' | 'error'

/**
 * Maps a detail query error to the screen state: only the API's
 * `404 NFT_NOT_FOUND` is a "NFT não encontrado" page; anything else
 * (5xx, offline, timeout, contract mismatch) is a retryable error state.
 */
export function detailFailure(error: unknown): DetailFailure {
  return isApiError(error) && error.status === 404 && error.code === 'NFT_NOT_FOUND' ? 'not-found' : 'error'
}
