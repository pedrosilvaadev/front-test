import {
  catalogQuerySchema,
  nftDetailSchema,
  nftListResponseSchema,
  nftSummaryListSchema,
  serializeCatalogQuery,
  type CatalogQueryInput,
  type NftDetail,
  type NftListResponse,
  type NftSummaryList,
} from '@/contracts'
import { apiClient } from './client'

/**
 * Typed catalog API (transport only, no hooks). Every 2xx body is validated
 * with its contract schema (ADR-002): a mismatch throws a `ZodError`, which is
 * a contract bug, not a recoverable API error. HTTP failures reject with
 * `ApiError` (see `./client`).
 */
export interface RequestOptions {
  signal?: AbortSignal
}

/**
 * Raw or normalized catalog query. `Partial` because zod infers the input of
 * the preprocessed list params as required `unknown`; omitted keys get defaults.
 */
export type ListNftsQuery = Partial<CatalogQueryInput>

/**
 * `GET /api/nfts`. The query is normalized with `catalogQuerySchema` (throws
 * `ZodError` on invalid input) and serialized without defaults, so equivalent
 * inputs produce identical requests.
 */
export async function listNfts(query: ListNftsQuery = {}, { signal }: RequestOptions = {}): Promise<NftListResponse> {
  const params = serializeCatalogQuery(catalogQuerySchema.parse(query))
  const { data } = await apiClient.get<unknown>('/nfts', { params, signal })
  return nftListResponseSchema.parse(data)
}

/** `GET /api/nfts/:idOrSlug`; 404 → `ApiError` code `NFT_NOT_FOUND`. */
export async function getNft(idOrSlug: string, { signal }: RequestOptions = {}): Promise<NftDetail> {
  const { data } = await apiClient.get<unknown>(`/nfts/${encodeURIComponent(idOrSlug)}`, { signal })
  return nftDetailSchema.parse(data)
}

/** `GET /api/nfts/featured` (hero carousel + "NFT em destaque"). */
export async function getFeaturedNfts({ signal }: RequestOptions = {}): Promise<NftSummaryList> {
  const { data } = await apiClient.get<unknown>('/nfts/featured', { signal })
  return nftSummaryListSchema.parse(data)
}

/** `GET /api/nfts/:idOrSlug/related` ("Mais desta coleção"). */
export async function getRelatedNfts(idOrSlug: string, { signal }: RequestOptions = {}): Promise<NftSummaryList> {
  const { data } = await apiClient.get<unknown>(`/nfts/${encodeURIComponent(idOrSlug)}/related`, { signal })
  return nftSummaryListSchema.parse(data)
}
