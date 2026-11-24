// Direct module imports (not the '@/contracts' barrel): this module is in the main chunk via validateSearch.
import { NETWORKS } from '@/contracts/common/primitives'
import {
  CATEGORIES,
  catalogQuerySchema,
  DEFAULT_CATALOG_QUERY,
  serializeCatalogQuery,
  type CatalogQuery,
} from '@/contracts/nfts'

/**
 * URL <-> catalog query mapping. The URL is the single source of truth for
 * catalog state (README §3): every filter, the search text, tab, sort and
 * page live in the search string, serialized without defaults by the
 * contract's `serializeCatalogQuery` so URLs stay short and canonical.
 */

export const CATALOG_SEARCH_KEYS = [
  'q',
  'categories',
  'networks',
  'minPrice',
  'maxPrice',
  'tab',
  'sort',
  'page',
  'pageSize',
] as const
export type CatalogSearchKey = (typeof CATALOG_SEARCH_KEYS)[number]

/** Route search shape: flat string params, defaults omitted (`serializeCatalogQuery` output). */
export type CatalogSearch = Partial<Record<CatalogSearchKey, string>>

const LIST_ALLOWED: Partial<Record<CatalogSearchKey, ReadonlySet<string>>> = {
  categories: new Set<string>(CATEGORIES),
  networks: new Set<string>(NETWORKS),
}

/**
 * Raw search value → param string. The app router keeps values as strings
 * (`parseFlatSearch`), but repeated keys arrive as arrays and router
 * defaults/tests may pass numbers or booleans. Repeated list params
 * (`categories`, `networks`) are joined; for scalar params the last value
 * wins (`?page=2&page=3` → 3).
 */
function toParamString(value: unknown, isList: boolean): string | undefined {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : undefined
  if (typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    if (!isList) return value.length > 0 ? toParamString(value[value.length - 1], false) : undefined
    const parts = value.map((part) => toParamString(part, false))
    return parts.every((part) => part !== undefined) ? parts.join(',') : undefined
  }
  return undefined
}

function freshDefaults(): CatalogQuery {
  return { ...DEFAULT_CATALOG_QUERY, categories: [], networks: [] }
}

/**
 * Raw route search → normalized `CatalogQuery`. Never throws: unknown list
 * items are dropped, and any other invalid field (e.g. `page=abc`,
 * `minPrice=-1`, `minPrice > maxPrice`) falls back to its default instead of
 * discarding the whole URL.
 */
export function parseCatalogSearch(raw: Readonly<Record<string, unknown>> | undefined | null): CatalogQuery {
  if (!raw) return freshDefaults()
  const input: Record<string, string> = {}
  for (const key of CATALOG_SEARCH_KEYS) {
    const allowed = LIST_ALLOWED[key]
    let value = toParamString(Object.hasOwn(raw, key) ? raw[key] : undefined, allowed !== undefined)
    if (value === undefined) continue
    if (allowed) value = value.split(',').filter((item) => allowed.has(item)).join(',')
    input[key] = value
  }
  for (let attempt = 0; attempt <= CATALOG_SEARCH_KEYS.length; attempt += 1) {
    const result = catalogQuerySchema.safeParse(input)
    if (result.success) return result.data
    const invalid = new Set(
      result.error.issues
        .map((issue) => issue.path[0])
        .filter((key): key is string => typeof key === 'string'),
    )
    if (invalid.size === 0) break
    for (const key of invalid) delete input[key]
  }
  return freshDefaults()
}

/** Normalized query → route search (defaults omitted). */
export function toCatalogSearch(query: CatalogQuery): CatalogSearch {
  return serializeCatalogQuery(query) as CatalogSearch
}

/** `validateSearch` for the catalog route: canonical flat params, never throws. */
export function validateCatalogSearch(raw: Record<string, unknown>): CatalogSearch {
  return toCatalogSearch(parseCatalogSearch(raw))
}

/** Changes the user can make; `page` is only honoured when it is the sole change. */
export type CatalogPatch = Partial<Omit<CatalogQuery, 'pageSize'>>

/**
 * Applies a UI change to the current query. Any change other than `page`
 * resets pagination to 1 (README §3). The result is re-normalized through the
 * contract schema (sorted lists, trimmed `q`, canonical ETH bounds).
 */
export function applyCatalogPatch(query: CatalogQuery, patch: CatalogPatch): CatalogQuery {
  const changesFilters = Object.keys(patch).some((key) => key !== 'page')
  const page = changesFilters ? 1 : (patch.page ?? query.page)
  return parseCatalogSearch(toCatalogSearch({ ...query, ...patch, page }))
}

/** Adds or removes `value` from a multi-select list. */
export function toggleValue<T extends string>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value]
}

/** Equality of normalized queries (used to discard responses for another query). */
export function isSameCatalogQuery(a: CatalogQuery, b: CatalogQuery): boolean {
  return JSON.stringify(toCatalogSearch(a)) === JSON.stringify(toCatalogSearch(b))
}

/** Search text, collections, networks or a price bound is set (tab and sort are views, not filters). */
export function hasActiveFilters(query: CatalogQuery): boolean {
  return (
    query.q !== undefined ||
    query.categories.length > 0 ||
    query.networks.length > 0 ||
    query.minPrice !== undefined ||
    query.maxPrice !== undefined
  )
}

/** Patch that clears every filter but keeps the selected tab and sort. */
export const CLEAR_FILTERS_PATCH: CatalogPatch = {
  q: undefined,
  categories: [],
  networks: [],
  minPrice: undefined,
  maxPrice: undefined,
}
