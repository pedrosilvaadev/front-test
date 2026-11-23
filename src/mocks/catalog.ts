import { z } from 'zod'
import {
  CATEGORIES,
  ethAmountSchema,
  idSchema,
  NETWORKS,
  nftDetailSchema,
  type CatalogFacets,
  type CatalogQuery,
  type NftDetail,
  type NftListResponse,
  type NftSummary,
} from '@/contracts'
import { compareEth, maxEth, minEth, normalizeEth } from '@/lib/money'
import { findNft, updateDb } from './db'

/** Max items returned by `/nfts/featured` and `/nfts/:id/related`. */
export const FEATURED_LIMIT = 6
export const RELATED_LIMIT = 8

/** Public card projection of a stored NFT (explicit keys: no private/extra data leaks). */
export function toSummary(nft: NftDetail): NftSummary {
  return {
    id: nft.id,
    slug: nft.slug,
    name: nft.name,
    tokenId: nft.tokenId,
    collection: { ...nft.collection },
    category: nft.category,
    network: nft.network,
    price: nft.price,
    previousPrice: nft.previousPrice,
    image: { ...nft.image },
    rarity: nft.rarity,
    flags: { ...nft.flags },
    totalAvailable: nft.totalAvailable,
    listedAt: nft.listedAt,
    version: nft.version,
  }
}

function matchesSearch(nft: NftDetail, q: string | undefined): boolean {
  if (!q) return true
  const needle = q.toLowerCase()
  return (
    nft.name.toLowerCase().includes(needle) ||
    nft.collection.name.toLowerCase().includes(needle) ||
    nft.tokenId.toLowerCase().includes(needle)
  )
}

function matchesTab(nft: NftDetail, tab: CatalogQuery['tab']): boolean {
  if (tab === 'new') return nft.flags.isNew
  if (tab === 'trending') return nft.flags.isTrending
  return true
}

function byId(a: NftDetail, b: NftDetail): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

function compareText(a: string, b: string): number {
  const x = a.toLowerCase()
  const y = b.toLowerCase()
  return x < y ? -1 : x > y ? 1 : 0
}

/** Comparators; every sort falls back to `id` so pages are deterministic. */
const SORTERS: Record<CatalogQuery['sort'], (a: NftDetail, b: NftDetail) => number> = {
  // ISO-8601 UTC strings of equal format compare lexicographically.
  recent: (a, b) => compareText(b.listedAt, a.listedAt) || byId(a, b),
  'price-asc': (a, b) => compareEth(a.price, b.price) || byId(a, b),
  'price-desc': (a, b) => compareEth(b.price, a.price) || byId(a, b),
  'name-asc': (a, b) => compareText(a.name, b.name) || byId(a, b),
}

/** Facets over listings matching `q` + `tab` only (contract: stable sidebar counts). */
export function computeFacets(base: readonly NftDetail[]): CatalogFacets {
  const categories = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as CatalogFacets['categories']
  const networks = Object.fromEntries(NETWORKS.map((n) => [n, 0])) as CatalogFacets['networks']
  let min: string | undefined
  let max: string | undefined
  for (const nft of base) {
    categories[nft.category] += 1
    networks[nft.network] += 1
    min = min === undefined ? nft.price : minEth(min, nft.price)
    max = max === undefined ? nft.price : maxEth(max, nft.price)
  }
  return { categories, networks, priceRange: { min: min ?? '0', max: max ?? '0' } }
}

/** Implements `GET /api/nfts` over the given listings for an already normalized query. */
export function queryCatalog(nfts: readonly NftDetail[], query: CatalogQuery): NftListResponse {
  const base = nfts.filter((nft) => matchesSearch(nft, query.q) && matchesTab(nft, query.tab))
  const { categories, networks, minPrice, maxPrice } = query

  const filtered = base.filter(
    (nft) =>
      (categories.length === 0 || categories.includes(nft.category)) &&
      (networks.length === 0 || networks.includes(nft.network)) &&
      (minPrice === undefined || compareEth(nft.price, minPrice) >= 0) &&
      (maxPrice === undefined || compareEth(nft.price, maxPrice) <= 0),
  )
  const sorted = [...filtered].sort(SORTERS[query.sort])

  const totalItems = sorted.length
  const totalPages = Math.ceil(totalItems / query.pageSize)
  const start = (query.page - 1) * query.pageSize
  return {
    items: sorted.slice(start, start + query.pageSize).map(toSummary),
    page: { page: query.page, pageSize: query.pageSize, totalItems, totalPages },
    query,
    facets: computeFacets(base),
  }
}

/** Featured listings ("hero" + "NFT em destaque"), most recent first. */
export function featuredNfts(nfts: readonly NftDetail[]): NftSummary[] {
  return nfts
    .filter((nft) => nft.flags.isFeatured)
    .sort(SORTERS.recent)
    .slice(0, FEATURED_LIMIT)
    .map(toSummary)
}

/** Same collection first, then same category; never the NFT itself. */
export function relatedNfts(nfts: readonly NftDetail[], target: NftDetail): NftSummary[] {
  const others = nfts.filter((nft) => nft.id !== target.id).sort(SORTERS.recent)
  const sameCollection = others.filter((nft) => nft.collection.id === target.collection.id)
  const sameCategory = others.filter(
    (nft) => nft.collection.id !== target.collection.id && nft.category === target.category,
  )
  return [...sameCollection, ...sameCategory].slice(0, RELATED_LIMIT).map(toSummary)
}

/** Body of the dev control `POST /api/__dev/nfts/:id` (mock only, not a public contract). */
export const nftDevPatchSchema = z
  .object({
    price: ethAmountSchema.transform(normalizeEth).optional(),
    previousPrice: ethAmountSchema.transform(normalizeEth).nullable().optional(),
    editions: z
      .array(z.object({ id: idSchema, available: z.int().min(0) }))
      .min(1)
      .optional(),
  })
  .refine((v) => v.price !== undefined || v.previousPrice !== undefined || v.editions !== undefined, {
    message: 'Provide price, previousPrice or editions',
  })
export type NftDevPatch = z.infer<typeof nftDevPatchSchema>

export type PatchNftResult =
  | { ok: true; nft: NftDetail }
  | { ok: false; code: 'NFT_NOT_FOUND' | 'EDITION_NOT_FOUND'; editionId?: string }
  | { ok: false; code: 'VALIDATION_ERROR'; error: z.ZodError }

/**
 * Patches price/availability of an NFT, recomputes `totalAvailable` and bumps
 * `version` (the same counter carried by `nft.updated`). The candidate is
 * validated against the contract before being committed, so the db never
 * holds an invalid NFT (e.g. `available > supply`).
 */
export function patchNft(idOrSlug: string, patch: NftDevPatch): PatchNftResult {
  const current = findNft(idOrSlug)
  if (!current) return { ok: false, code: 'NFT_NOT_FOUND' }

  const editions = current.editions.map((e) => ({ ...e }))
  for (const change of patch.editions ?? []) {
    const edition = editions.find((e) => e.id === change.id)
    if (!edition) return { ok: false, code: 'EDITION_NOT_FOUND', editionId: change.id }
    edition.available = change.available
  }

  const candidate: NftDetail = {
    ...current,
    price: patch.price ?? current.price,
    previousPrice: patch.previousPrice === undefined ? current.previousPrice : patch.previousPrice,
    editions,
    totalAvailable: editions.reduce((sum, e) => sum + e.available, 0),
    version: current.version + 1,
  }
  const parsed = nftDetailSchema.safeParse(candidate)
  if (!parsed.success) return { ok: false, code: 'VALIDATION_ERROR', error: parsed.error }

  updateDb((state) => {
    state.nfts = state.nfts.map((nft) => (nft.id === current.id ? candidate : nft))
  })
  return { ok: true, nft: candidate }
}
