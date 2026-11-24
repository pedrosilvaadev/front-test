import { describe, expect, it } from 'vitest'
import { DEFAULT_CATALOG_QUERY, type CatalogQuery } from '@/contracts'
import { parseFlatSearch, stringifyFlatSearch } from '@/router'
import {
  applyCatalogPatch,
  CLEAR_FILTERS_PATCH,
  hasActiveFilters,
  isSameCatalogQuery,
  parseCatalogSearch,
  toCatalogSearch,
  toggleValue,
  validateCatalogSearch,
} from './catalog-search'

const defaults = (): CatalogQuery => ({ ...DEFAULT_CATALOG_QUERY, categories: [], networks: [] })

describe('parseCatalogSearch', () => {
  it('returns the normalized defaults for an empty search', () => {
    expect(parseCatalogSearch({})).toEqual(defaults())
    expect(parseCatalogSearch(undefined)).toEqual(defaults())
  })

  it('normalizes every field (lists sorted/deduplicated, q trimmed, ETH canonical)', () => {
    expect(
      parseCatalogSearch({
        q: '  ape ',
        categories: 'music,digital-art,music',
        networks: 'solana,ethereum',
        minPrice: '0.50',
        maxPrice: '12.30',
        tab: 'trending',
        sort: 'price-asc',
        page: '3',
      }),
    ).toEqual({
      ...defaults(),
      q: 'ape',
      categories: ['digital-art', 'music'],
      networks: ['ethereum', 'solana'],
      minPrice: '0.5',
      maxPrice: '12.3',
      tab: 'trending',
      sort: 'price-asc',
      page: 3,
    })
  })

  it('accepts the primitives a router parser may produce (numbers, booleans, repeated keys)', () => {
    expect(parseCatalogSearch({ page: 2, minPrice: 1.5, q: 123 })).toMatchObject({ page: 2, minPrice: '1.5', q: '123' })
    expect(parseCatalogSearch({ q: true })).toMatchObject({ q: 'true' })
    expect(parseCatalogSearch({ categories: ['music', 'gaming'] }).categories).toEqual(['gaming', 'music'])
  })

  it('drops unknown list items and falls back per field instead of discarding the URL', () => {
    expect(
      parseCatalogSearch({ categories: 'music,unknown', networks: 'bitcoin', page: 'abc', tab: 'nope', sort: 'price-asc' }),
    ).toEqual({ ...defaults(), categories: ['music'], sort: 'price-asc' })
    expect(parseCatalogSearch({ page: '0' }).page).toBe(1)
    expect(parseCatalogSearch({ page: '1.5' }).page).toBe(1)
    expect(parseCatalogSearch({ minPrice: '-1', maxPrice: 'abc' })).toEqual(defaults())
    expect(parseCatalogSearch({ q: 'x'.repeat(101) }).q).toBeUndefined()
  })

  it('drops maxPrice when it is below minPrice', () => {
    expect(parseCatalogSearch({ minPrice: '5', maxPrice: '1' })).toEqual({ ...defaults(), minPrice: '5' })
  })

  it('ignores keys that are not catalog params', () => {
    expect(parseCatalogSearch({ scenario: 'slow', foo: 'bar' })).toEqual(defaults())
  })
})

describe('toCatalogSearch / validateCatalogSearch', () => {
  it('omits defaults so the canonical URL of the default view is empty', () => {
    expect(toCatalogSearch(defaults())).toEqual({})
    expect(validateCatalogSearch({ tab: 'all', sort: 'recent', page: '1', pageSize: '9' })).toEqual({})
  })

  it('serializes lists as csv and numbers as strings', () => {
    expect(
      toCatalogSearch({ ...defaults(), categories: ['digital-art', 'music'], minPrice: '0.5', page: 2 }),
    ).toEqual({ categories: 'digital-art,music', minPrice: '0.5', page: '2' })
  })

  it('round-trips through the router flat search serializer', () => {
    const query: CatalogQuery = {
      ...defaults(),
      q: '123',
      categories: ['3d-art', 'music'],
      networks: ['polygon'],
      minPrice: '0.000000000000000001',
      maxPrice: '1.5',
      tab: 'new',
      sort: 'name-asc',
      page: 4,
    }
    const url = stringifyFlatSearch(toCatalogSearch(query))
    expect(url).toBe(
      '?q=123&categories=3d-art,music&networks=polygon&minPrice=0.000000000000000001&maxPrice=1.5&tab=new&sort=name-asc&page=4',
    )
    expect(parseCatalogSearch(parseFlatSearch(url))).toEqual(query)
  })

  it('keeps search text with reserved characters intact', () => {
    const query = { ...defaults(), q: 'a&b=c, "d"' }
    const url = stringifyFlatSearch(toCatalogSearch(query))
    expect(parseCatalogSearch(parseFlatSearch(url)).q).toBe('a&b=c, "d"')
  })
})

describe('applyCatalogPatch', () => {
  const onPage3: CatalogQuery = { ...defaults(), categories: ['music'], page: 3 }

  it('resets the page to 1 on any filter, search, tab or sort change', () => {
    expect(applyCatalogPatch(onPage3, { categories: ['music', 'gaming'] })).toMatchObject({
      categories: ['gaming', 'music'],
      page: 1,
    })
    expect(applyCatalogPatch(onPage3, { q: 'ape' }).page).toBe(1)
    expect(applyCatalogPatch(onPage3, { tab: 'new' }).page).toBe(1)
    expect(applyCatalogPatch(onPage3, { sort: 'price-desc' }).page).toBe(1)
    expect(applyCatalogPatch(onPage3, { minPrice: '1' }).page).toBe(1)
  })

  it('keeps filters when only the page changes', () => {
    expect(applyCatalogPatch(onPage3, { page: 2 })).toEqual({ ...onPage3, page: 2 })
  })

  it('re-normalizes the result (trimmed q, canonical ETH)', () => {
    expect(applyCatalogPatch(defaults(), { q: '   ', minPrice: '1.50' })).toEqual({ ...defaults(), minPrice: '1.5' })
  })

  it('clears filters but keeps tab and sort', () => {
    const query: CatalogQuery = {
      ...defaults(),
      q: 'ape',
      categories: ['music'],
      networks: ['solana'],
      minPrice: '1',
      maxPrice: '2',
      tab: 'trending',
      sort: 'price-asc',
      page: 2,
    }
    expect(applyCatalogPatch(query, CLEAR_FILTERS_PATCH)).toEqual({ ...defaults(), tab: 'trending', sort: 'price-asc' })
  })
})

describe('helpers', () => {
  it('toggleValue adds and removes', () => {
    expect(toggleValue(['music'], 'gaming')).toEqual(['music', 'gaming'])
    expect(toggleValue(['music', 'gaming'], 'music')).toEqual(['gaming'])
  })

  it('isSameCatalogQuery compares normalized content', () => {
    expect(
      isSameCatalogQuery(
        parseCatalogSearch({ categories: 'music,gaming', minPrice: '1.50' }),
        parseCatalogSearch({ categories: 'gaming,music', minPrice: '1.5' }),
      ),
    ).toBe(true)
    expect(isSameCatalogQuery(defaults(), { ...defaults(), page: 2 })).toBe(false)
  })

  it('hasActiveFilters ignores tab, sort and page', () => {
    expect(hasActiveFilters({ ...defaults(), tab: 'new', sort: 'price-asc', page: 3 })).toBe(false)
    expect(hasActiveFilters({ ...defaults(), networks: ['solana'] })).toBe(true)
    expect(hasActiveFilters({ ...defaults(), maxPrice: '1' })).toBe(true)
  })
})
