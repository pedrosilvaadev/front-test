import { z } from 'zod'
import { compareEth, isEthAmount, normalizeEth } from '@/lib/money'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, pageMetaSchema } from './common/pagination'
import {
  ethAmountSchema,
  idSchema,
  imageSchema,
  isoDateTimeSchema,
  networkSchema,
  versionSchema,
} from './common/primitives'

/**
 * Catalog (README §3 "Início", "Detalhes do NFT"; §5 "NFTs"). Public resources:
 * they never contain user-specific fields (favorite flag, cart quantity) so
 * their cache entries can be shared across sessions (ADR-004).
 */

/** Sidebar "Coleções" (Figma Início). Labels are localized in the UI. */
export const CATEGORIES = [
  'digital-art',
  'photography',
  'music',
  '3d-art',
  'collectibles',
  'generative',
  'gaming',
  'subscriptions',
  'utility',
] as const
export const categorySchema = z.enum(CATEGORIES)
export type Category = z.infer<typeof categorySchema>

export const RARITIES = ['common', 'rare', 'epic', 'legendary'] as const
export const raritySchema = z.enum(RARITIES)

/** Tabs: "Todos os NFTs" / "Novos lançamentos" / "Em alta". */
export const CATALOG_TABS = ['all', 'new', 'trending'] as const
export const catalogTabSchema = z.enum(CATALOG_TABS)
export type CatalogTab = z.infer<typeof catalogTabSchema>

/** "Ordenar por". `recent` = "Listados recentemente" (default). */
export const CATALOG_SORTS = ['recent', 'price-asc', 'price-desc', 'name-asc'] as const
export const catalogSortSchema = z.enum(CATALOG_SORTS)
export type CatalogSort = z.infer<typeof catalogSortSchema>

/**
 * Edition (Figma chips "1/1", "1/10", "1/50", "ABERTA"). Price is per NFT;
 * editions differ in supply/availability.
 *  - `unique`:  `supply === 1`, `available` ∈ {0, 1};
 *  - `limited`: `supply` ≥ 2 (total minted), `0 ≤ available ≤ supply`;
 *  - `open`:    `supply === null` (uncapped edition); `available` is the
 *    remaining allocation of the current sale window (finite so the
 *    simulation can sell out and emit `nft.updated`).
 * `available` already excludes units reserved by pending orders.
 */
export const editionSchema = z
  .object({
    id: idSchema,
    label: z.string().min(1),
    kind: z.enum(['unique', 'limited', 'open']),
    supply: z.int().positive().nullable(),
    available: z.int().min(0),
    /** Max units of this edition in one cart line/order ("limite de quantidade"). */
    maxPerOrder: z.int().positive(),
  })
  .refine(
    (e) => {
      if (e.kind === 'open') return e.supply === null
      if (e.supply === null) return false
      if (e.kind === 'unique' && e.supply !== 1) return false
      if (e.kind === 'limited' && e.supply < 2) return false
      return e.available <= e.supply
    },
    {
      path: ['supply'],
      message: 'unique: supply 1; limited: supply >= 2; open: supply null; available <= supply',
    },
  )
export type Edition = z.infer<typeof editionSchema>

export const nftFlagsSchema = z.object({
  isNew: z.boolean(),
  isTrending: z.boolean(),
  isFeatured: z.boolean(),
})

export const collectionRefSchema = z.object({ id: idSchema, name: z.string().min(1) })

/** Card data for the catalog grid, featured blocks and carousels. */
export const nftSummarySchema = z.object({
  id: idSchema,
  slug: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  /** Display token id, e.g. "#0042". */
  tokenId: z.string().min(1),
  collection: collectionRefSchema,
  category: categorySchema,
  network: networkSchema,
  price: ethAmountSchema,
  /** Strike-through price ("1.99 ETH 2.29 ETH"); null when not discounted. */
  previousPrice: ethAmountSchema.nullable(),
  image: imageSchema,
  rarity: raritySchema,
  flags: nftFlagsSchema,
  /** Sum of `available` over editions; 0 = sold out. */
  totalAvailable: z.int().min(0),
  listedAt: isoDateTimeSchema,
  /** Monotonic; bumped on every price/availability change (matches `nft.updated`). */
  version: versionSchema,
})
export type NftSummary = z.infer<typeof nftSummarySchema>

export const nftDetailSchema = nftSummarySchema.extend({
  description: z.string(),
  /** Long form paragraphs for the "Detalhes do NFT" tab. */
  details: z.array(z.string()),
  gallery: z.array(imageSchema).min(1),
  attributes: z.array(z.string()),
  editions: z.array(editionSchema).min(1),
  creator: z.object({ id: idSchema, name: z.string().min(1), royaltyPercent: z.string() }),
  contract: z.object({
    address: z.string().min(1),
    standard: z.enum(['ERC-721', 'ERC-1155', 'SPL']),
    metadataStorage: z.string(),
  }),
  rating: z.object({ average: z.string().regex(/^[0-5](\.\d)?$/), count: z.int().min(0) }),
})
export type NftDetail = z.infer<typeof nftDetailSchema>

/** Comma-separated list in the query string → sorted, de-duplicated array. */
function csvList<T extends z.ZodType<string>>(item: T) {
  return z
    .preprocess(
      (value) => {
        if (value === undefined || value === null || value === '') return []
        if (typeof value === 'string') return value.split(',').filter(Boolean)
        return value
      },
      z.array(item),
    )
    .transform((list) => [...new Set(list)].sort())
}

const optionalTrimmed = z
  .string()
  .max(100)
  .optional()
  .transform((v) => {
    const trimmed = v?.trim()
    return trimmed ? trimmed : undefined
  })

/** ETH filter bound normalized to canonical form ("12.30" → "12.3") so equal values share a query key. */
const canonicalEth = ethAmountSchema.transform(normalizeEth)

/**
 * Integer query param: accepts a number (already normalized) or a string of
 * digits only. Rejects "1.5", "1e2", " 2", "0x10", "".
 */
function intParam(min: number, max = Number.MAX_SAFE_INTEGER) {
  return z.preprocess(
    (value) => (typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value),
    z.int().min(min).max(max),
  )
}

/**
 * `GET /api/nfts` query. Accepts raw string values (URLSearchParams / router
 * search) and normalizes them: defaults filled, lists sorted/deduplicated.
 * The normalized output is used verbatim in query keys (ADR-004).
 * Invalid input → 400 INVALID_QUERY on the API; the router may fall back to
 * defaults per field instead.
 */
export const catalogQuerySchema = z
  .object({
    q: optionalTrimmed,
    categories: csvList(categorySchema),
    networks: csvList(networkSchema),
    minPrice: canonicalEth.optional(),
    maxPrice: canonicalEth.optional(),
    tab: catalogTabSchema.default('all'),
    sort: catalogSortSchema.default('recent'),
    page: intParam(1).default(1),
    pageSize: intParam(1, MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  })
  .refine(
    (v) =>
      // zod v4 may run this refine even when a field failed: never call money fns on invalid input.
      !isEthAmount(v.minPrice) || !isEthAmount(v.maxPrice) || compareEth(v.minPrice, v.maxPrice) <= 0,
    { path: ['maxPrice'], message: 'maxPrice must be greater than or equal to minPrice' },
  )
export type CatalogQuery = z.output<typeof catalogQuerySchema>
export type CatalogQueryInput = z.input<typeof catalogQuerySchema>

/** Normalized default query (`catalogQuerySchema.parse({})`). */
export const DEFAULT_CATALOG_QUERY: CatalogQuery = {
  q: undefined,
  categories: [],
  networks: [],
  minPrice: undefined,
  maxPrice: undefined,
  tab: 'all',
  sort: 'recent',
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
}

/**
 * Serializes a normalized query into flat string params (for Axios `params`
 * and the URL), omitting defaults so URLs stay short and canonical.
 */
export function serializeCatalogQuery(query: CatalogQuery): Record<string, string> {
  const out: Record<string, string> = {}
  if (query.q) out.q = query.q
  if (query.categories.length > 0) out.categories = query.categories.join(',')
  if (query.networks.length > 0) out.networks = query.networks.join(',')
  if (query.minPrice !== undefined) out.minPrice = query.minPrice
  if (query.maxPrice !== undefined) out.maxPrice = query.maxPrice
  if (query.tab !== 'all') out.tab = query.tab
  if (query.sort !== 'recent') out.sort = query.sort
  if (query.page !== 1) out.page = String(query.page)
  if (query.pageSize !== DEFAULT_PAGE_SIZE) out.pageSize = String(query.pageSize)
  return out
}

// zod v4: a record keyed by an enum is exhaustive (every key required).
const countsByNetwork = z.record(networkSchema, z.int().min(0))
const countsByCategory = z.record(categorySchema, z.int().min(0))

/**
 * Sidebar counts and slider bounds. Computed over listings matching `q` and
 * `tab` only (not categories/networks/price) so counts stay stable while the
 * user toggles filters.
 */
export const catalogFacetsSchema = z.object({
  categories: countsByCategory,
  networks: countsByNetwork,
  priceRange: z.object({ min: ethAmountSchema, max: ethAmountSchema }),
})
export type CatalogFacets = z.infer<typeof catalogFacetsSchema>

/** `GET /api/nfts` response. Echoes the normalized `query` (out-of-order guard + test assertions). */
export const nftListResponseSchema = z.object({
  items: z.array(nftSummarySchema),
  page: pageMetaSchema,
  query: catalogQuerySchema,
  facets: catalogFacetsSchema,
})
export type NftListResponse = z.infer<typeof nftListResponseSchema>

/** `GET /api/nfts/featured` (hero + "NFT em destaque") and `GET /api/nfts/:id/related`. */
export const nftSummaryListSchema = z.object({ items: z.array(nftSummarySchema) })
export type NftSummaryList = z.infer<typeof nftSummaryListSchema>
