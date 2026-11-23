import { http, HttpResponse, type DefaultBodyType, type PathParams } from 'msw'
import type { ErrorEnvelope } from '@/api/errors'
import {
  catalogQuerySchema,
  toFieldErrorsDetails,
  type NftDetail,
  type NftListResponse,
  type NftSummaryList,
} from '@/contracts'
import { featuredNfts, queryCatalog, relatedNfts } from '../catalog'
import { findNft, getDb } from '../db'
import { apiPath, errorResponse } from '../http'

/** Query keys of `GET /api/nfts`; unknown params are ignored (forward compatible). */
const LIST_PARAMS = ['categories', 'networks'] as const

/**
 * Raw query → schema input. Repeated list params (`?categories=a&categories=b`)
 * are joined as CSV; repeated scalar params are passed as arrays so the
 * schema rejects them instead of silently picking one.
 */
function rawQuery(params: URLSearchParams): Record<string, unknown> {
  const raw: Record<string, unknown> = {}
  for (const key of new Set(params.keys())) {
    const values = params.getAll(key)
    if ((LIST_PARAMS as readonly string[]).includes(key)) raw[key] = values.join(',')
    else raw[key] = values.length === 1 ? values[0] : values
  }
  return raw
}

type IdParams = { idOrSlug: string }

function nftNotFound(idOrSlug: string) {
  return errorResponse(404, 'NFT_NOT_FOUND', 'NFT not found.', { idOrSlug })
}

/** Public catalog endpoints (docs/API_CONTRACTS.md "NFTs"). Read-only: never mutate or persist the db. */
export const nftHandlers = [
  http.get<PathParams, DefaultBodyType, NftListResponse | ErrorEnvelope>(apiPath('/nfts'), ({ request }) => {
    const parsed = catalogQuerySchema.safeParse(rawQuery(new URL(request.url).searchParams))
    if (!parsed.success) {
      return errorResponse(400, 'INVALID_QUERY', 'Invalid catalog query.', toFieldErrorsDetails(parsed.error))
    }
    return HttpResponse.json<NftListResponse>(queryCatalog(getDb().nfts, parsed.data))
  }),

  // Registered before `/nfts/:idOrSlug` so "featured" is never treated as a slug.
  http.get(apiPath('/nfts/featured'), () =>
    HttpResponse.json<NftSummaryList>({ items: featuredNfts(getDb().nfts) }),
  ),

  http.get<IdParams, DefaultBodyType, NftSummaryList | ErrorEnvelope>(apiPath('/nfts/:idOrSlug/related'), ({ params }) => {
    const idOrSlug = params.idOrSlug
    const nft = findNft(idOrSlug)
    if (!nft) return nftNotFound(idOrSlug)
    return HttpResponse.json<NftSummaryList>({ items: relatedNfts(getDb().nfts, nft) })
  }),

  http.get<IdParams, DefaultBodyType, NftDetail | ErrorEnvelope>(apiPath('/nfts/:idOrSlug'), ({ params }) => {
    const idOrSlug = params.idOrSlug
    const nft = findNft(idOrSlug)
    if (!nft) return nftNotFound(idOrSlug)
    return HttpResponse.json<NftDetail>(nft)
  }),
]
