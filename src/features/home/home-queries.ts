import { queryOptions } from '@tanstack/react-query'
import { getFeaturedNfts } from '@/api/nfts'
import { queryKeys } from '@/lib/query-keys'
import { CATALOG_STALE_TIME_MS, shouldRetryCatalog } from '../catalog/catalog-queries'

/** The hero shows at most three slides (Figma: three dots). */
export const HERO_SLIDE_LIMIT = 3

/**
 * `GET /api/nfts/featured`: public, shared by the hero carousel and the
 * "NFT em destaque" card (one request, one cache entry, ADR-004). The
 * AbortSignal is forwarded so an unmounted home cancels the request.
 */
export function featuredNftsQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.catalog.featured(),
    queryFn: ({ signal }) => getFeaturedNfts({ signal }),
    staleTime: CATALOG_STALE_TIME_MS,
    retry: shouldRetryCatalog,
  })
}
