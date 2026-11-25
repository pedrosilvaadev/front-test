import { describe, expect, it } from 'vitest'
import { CATEGORIES, DEFAULT_CATALOG_QUERY, NETWORKS, type NftListResponse } from '@/contracts'
import { compareEth } from '@/lib/money'
import { createNftSeed } from '@/mocks/fixtures/nfts'
import { setScenario } from '@/mocks/scenario'
import { apiClient } from './client'
import { isApiError, type ApiError } from './errors'
import { getFeaturedNfts, getNft, getRelatedNfts, listNfts, type ListNftsQuery } from './nfts'

const seed = createNftSeed()

async function captureError(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise
  } catch (error) {
    if (isApiError(error)) return error
    throw new Error(`Expected ApiError, got ${String(error)}`, { cause: error })
  }
  throw new Error('Expected request to fail')
}

async function listAll(query: ListNftsQuery = {}): Promise<NftListResponse> {
  return listNfts({ ...query, pageSize: 48 })
}

describe('GET /api/nfts', () => {
  it('returns the default first page with normalized query echo and facets', async () => {
    const response = await listNfts()

    expect(response.items).toHaveLength(9)
    expect(response.items[0]?.name).toBe('Emerald Ape #042')
    expect(response.items.slice(0, 3).map((n) => n.name)).toEqual([
      'Emerald Ape #042',
      'Sage Nomad #009',
      'Neon Vessel #552',
    ])
    expect(response.page).toEqual({ page: 1, pageSize: 9, totalItems: 48, totalPages: 6 })
    expect(response.query).toEqual(DEFAULT_CATALOG_QUERY)
    expect(Object.values(response.facets.categories).reduce((a, b) => a + b, 0)).toBe(48)
    expect(Object.values(response.facets.networks).reduce((a, b) => a + b, 0)).toBe(48)
    expect(Object.keys(response.facets.categories).sort()).toEqual([...CATEGORIES].sort())
    expect(Object.keys(response.facets.networks).sort()).toEqual([...NETWORKS].sort())
    expect(response.facets.priceRange).toEqual({ min: '0.02', max: '12.3' })
  })

  it('combines categories (OR), networks (OR) and inclusive price bounds (AND)', async () => {
    const response = await listAll({ categories: 'music,3d-art', networks: 'solana,polygon', minPrice: '0.27', maxPrice: '1.05' })
    const expected = seed.filter(
      (n) =>
        ['music', '3d-art'].includes(n.category) &&
        ['solana', 'polygon'].includes(n.network) &&
        compareEth(n.price, '0.27') >= 0 &&
        compareEth(n.price, '1.05') <= 0,
    )

    expect(expected.length).toBeGreaterThan(1)
    expect(response.items.map((n) => n.id).sort()).toEqual(expected.map((n) => n.id).sort())
    // Inclusive at both bounds.
    expect(response.items.map((n) => n.price)).toEqual(expect.arrayContaining(['0.27', '1.05']))
    expect(response.query).toMatchObject({ categories: ['3d-art', 'music'], networks: ['polygon', 'solana'] })
  })

  it('compares prices as decimals and echoes canonical bounds', async () => {
    const top = await listAll({ minPrice: '12.30' })
    expect(top.items.map((n) => n.name)).toEqual(['Emerald Regent #012'])
    expect(top.query.minPrice).toBe('12.3')

    // "9.9" > "12.3" as strings but not as decimals.
    const mid = await listAll({ minPrice: '9.9', maxPrice: '12.3' })
    expect(mid.items.map((n) => n.price).sort()).toEqual(['12.3', '9.9'])

    const exact = await listAll({ minPrice: '0.02', maxPrice: '0.020' })
    expect(exact.items.map((n) => n.name)).toEqual(['Onyx Pass #999'])
  })

  it('searches name, collection and token id case-insensitively', async () => {
    const byName = await listAll({ q: '  GOLDEN ' })
    expect(byName.items.length).toBeGreaterThan(0)
    expect(byName.items.every((n) => n.name.toLowerCase().includes('golden') || n.collection.name.toLowerCase().includes('golden'))).toBe(true)
    expect(byName.query.q).toBe('GOLDEN')

    const byToken = await listAll({ q: '#0042' })
    expect(byToken.items.map((n) => n.name)).toEqual(['Emerald Ape #042'])

    const byCollection = await listAll({ q: 'kurio apes' })
    expect(byCollection.items.every((n) => n.collection.name === 'Kurio Apes')).toBe(true)
  })

  it('filters by tab', async () => {
    const trending = await listAll({ tab: 'trending' })
    expect(trending.items.length).toBe(seed.filter((n) => n.flags.isTrending).length)
    expect(trending.items.every((n) => n.flags.isTrending)).toBe(true)

    const fresh = await listAll({ tab: 'new' })
    expect(fresh.items.every((n) => n.flags.isNew)).toBe(true)
  })

  it('computes facets over q + tab only, so they stay stable while filtering', async () => {
    const trending = await listAll({ tab: 'trending' })
    const trendingFiltered = await listAll({ tab: 'trending', categories: 'music', networks: 'solana', maxPrice: '0.5' })

    expect(trendingFiltered.facets).toEqual(trending.facets)
    expect(Object.values(trending.facets.categories).reduce((a, b) => a + b, 0)).toBe(trending.page.totalItems)

    const empty = await listNfts({ q: 'no-such-nft' })
    expect(empty.page).toEqual({ page: 1, pageSize: 9, totalItems: 0, totalPages: 0 })
    expect(empty.facets.priceRange).toEqual({ min: '0', max: '0' })
    expect(empty.facets.networks).toEqual({ ethereum: 0, polygon: 0, solana: 0 })
  })

  it('paginates with stable boundaries', async () => {
    const pages = await Promise.all([1, 2, 3, 4, 5, 6].map((page) => listNfts({ page })))
    const ids = pages.flatMap((p) => p.items.map((n) => n.id))
    expect(ids).toHaveLength(48)
    expect(new Set(ids).size).toBe(48)
    expect(pages[5]?.items).toHaveLength(3)

    const past = await listNfts({ page: 7 })
    expect(past.items).toEqual([])
    expect(past.page).toEqual({ page: 7, pageSize: 9, totalItems: 48, totalPages: 6 })

    const single = await listNfts({ pageSize: 1, page: 48 })
    expect(single.items).toHaveLength(1)
    expect(single.page.totalPages).toBe(48)
  })

  it.each([
    ['price-asc', (a: string, b: string) => compareEth(a, b) <= 0],
    ['price-desc', (a: string, b: string) => compareEth(a, b) >= 0],
  ] as const)('sorts by %s using decimal comparison', async (sort, ordered) => {
    const { items } = await listAll({ sort })
    for (let i = 1; i < items.length; i += 1) expect(ordered(items[i - 1]!.price, items[i]!.price)).toBe(true)
  })

  it('sorts by name and by recency with deterministic ties', async () => {
    const byName = (await listAll({ sort: 'name-asc' })).items.map((n) => n.name.toLowerCase())
    expect(byName).toEqual([...byName].sort())

    const recent = (await listAll({ sort: 'recent' })).items.map((n) => n.listedAt)
    expect(recent).toEqual([...recent].sort().reverse())

    const first = await listAll({ sort: 'price-asc' })
    const second = await listAll({ sort: 'price-asc' })
    expect(second.items.map((n) => n.id)).toEqual(first.items.map((n) => n.id))
  })

  it.each([
    [{ page: '1.5' }, 'page'],
    [{ page: '0' }, 'page'],
    [{ pageSize: '49' }, 'pageSize'],
    [{ categories: 'digital-art,bogus' }, 'categories.1'],
    [{ networks: 'bitcoin' }, 'networks.0'],
    [{ minPrice: '-1' }, 'minPrice'],
    [{ minPrice: '1e3' }, 'minPrice'],
    [{ minPrice: '2', maxPrice: '1' }, 'maxPrice'],
    [{ sort: 'cheapest' }, 'sort'],
    [{ tab: 'hot' }, 'tab'],
  ])('rejects invalid query %j with INVALID_QUERY field errors', async (params, field) => {
    const error = await captureError(apiClient.get('/nfts', { params }))

    expect(error.kind).toBe('validation')
    expect(error.status).toBe(400)
    expect(error.code).toBe('INVALID_QUERY')
    expect(error.details).toMatchObject({ fieldErrors: { [field]: expect.any(Array) } })
  })

  it('rejects repeated scalar params instead of picking one', async () => {
    const error = await captureError(apiClient.get('/nfts?page=1&page=2'))
    expect(error.code).toBe('INVALID_QUERY')

    const { data } = await apiClient.get<NftListResponse>('/nfts?categories=music&categories=gaming')
    expect(data.query.categories).toEqual(['gaming', 'music'])
  })

  it('stays behind the scenario middleware', async () => {
    setScenario('offline')
    const error = await captureError(listNfts())
    expect(error.kind).toBe('network')
  })

  it('honours the caller AbortSignal', async () => {
    const controller = new AbortController()
    controller.abort()
    const error = await captureError(listNfts({}, { signal: controller.signal }))
    expect(error.kind).toBe('canceled')
  })
})

describe('GET /api/nfts/:idOrSlug', () => {
  it('returns the detail by id and by slug', async () => {
    const byId = await getNft('nft_001')
    const bySlug = await getNft('emerald-ape-042')

    expect(bySlug).toStrictEqual(byId)
    expect(byId).toMatchObject({ name: 'Emerald Ape #042', price: '1.19', collection: { name: 'Kurio Apes' } })
    expect(byId.editions.length).toBeGreaterThan(0)
  })

  it('answers 404 NFT_NOT_FOUND for unknown ids', async () => {
    const error = await captureError(getNft('nope'))
    expect(error.kind).toBe('not_found')
    expect(error.code).toBe('NFT_NOT_FOUND')

    const related = await captureError(getRelatedNfts('nope'))
    expect(related.code).toBe('NFT_NOT_FOUND')
  })

  it('serves featured and related listings', async () => {
    const featured = await getFeaturedNfts()
    expect(featured.items.length).toBeGreaterThan(0)
    expect(featured.items.every((n) => n.flags.isFeatured)).toBe(true)
    expect(featured.items.map((n) => n.name)).toContain('Sage Nomad #009')

    const related = await getRelatedNfts('emerald-ape-042')
    expect(related.items.length).toBeGreaterThan(0)
    expect(related.items.some((n) => n.id === 'nft_001')).toBe(false)
    expect(related.items[0]?.collection.name).toBe('Kurio Apes')
  })
})

describe('POST /api/__dev/nfts/:id', () => {
  it('patches price and availability, bumps version and is reflected by the catalog', async () => {
    const before = await getNft('nft_003')
    const { data } = await apiClient.post('/__dev/nfts/nft_003', {
      price: '2.10',
      editions: [{ id: 'nft_003-1of10', available: 0 }],
    })

    expect(data).toMatchObject({ price: '2.1', version: before.version + 1 })
    const after = await getNft('neon-vessel-552')
    expect(after.version).toBe(before.version + 1)
    expect(after.editions.find((e) => e.id === 'nft_003-1of10')?.available).toBe(0)
    const removed = before.editions.find((e) => e.id === 'nft_003-1of10')?.available ?? 0
    expect(after.totalAvailable).toBe(before.totalAvailable - removed)

    const list = await listAll({ q: 'neon vessel' })
    expect(list.items[0]).toMatchObject({ price: '2.1', version: after.version, totalAvailable: after.totalAvailable })
  })

  it('validates the patch and reports unknown NFTs/editions', async () => {
    const empty = await captureError(apiClient.post('/__dev/nfts/nft_001', {}))
    expect(empty).toMatchObject({ status: 422, code: 'VALIDATION_ERROR' })

    const overSupply = await captureError(
      apiClient.post('/__dev/nfts/nft_001', { editions: [{ id: 'nft_001-1of1', available: 2 }] }),
    )
    expect(overSupply).toMatchObject({ status: 422, code: 'VALIDATION_ERROR' })

    const unknownNft = await captureError(apiClient.post('/__dev/nfts/nope', { price: '1' }))
    expect(unknownNft).toMatchObject({ status: 404, code: 'NFT_NOT_FOUND' })

    const unknownEdition = await captureError(
      apiClient.post('/__dev/nfts/nft_001', { editions: [{ id: 'x', available: 1 }] }),
    )
    expect(unknownEdition).toMatchObject({ status: 404, code: 'EDITION_NOT_FOUND' })

    expect((await getNft('nft_001')).version).toBe(1)
  })

  it('POST /api/__dev/reset restores the seed after a mutation (version stays monotonic)', async () => {
    await apiClient.post('/__dev/nfts/nft_001', { price: '5' })
    expect((await getNft('nft_001')).price).toBe('5')

    await apiClient.post('/__dev/reset')

    expect(await getNft('nft_001')).toStrictEqual({ ...seed[0], version: 3 })
  })
})
