import { afterEach, describe, expect, it, vi } from 'vitest'
import type { z } from 'zod'
import { CATEGORIES, NETWORKS, nftDetailSchema, nftSummarySchema } from '@/contracts'
import { compareEth } from '@/lib/money'
import { patchNft, toSummary } from './catalog'
import {
  createSeedState,
  DB_SCHEMA_VERSION,
  DB_STORAGE_KEY,
  findNft,
  getDb,
  initDb,
  resetDb,
  type DbStorage,
} from './db'
import { createNftSeed } from './fixtures/nfts'
import { DEMO_CREDENTIALS, SEED_USERS, userRecordSchema } from './fixtures/users'
import { hashPassword, verifyPassword } from './password'

/** ADR-002: fixtures must survive parsing unchanged (no stripped typos). */
function expectExactParse(schema: z.ZodType, fixture: unknown) {
  const result = schema.safeParse(fixture)
  expect(result.error).toBeUndefined()
  expect(result.data).toStrictEqual(fixture)
}

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  const storage = {
    data,
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => void data.set(key, value)),
    removeItem: vi.fn((key: string) => void data.delete(key)),
  }
  return storage satisfies DbStorage
}

afterEach(() => {
  // Detach any test storage so other suites stay memory only.
  initDb(undefined)
  resetDb()
})

describe('NFT fixtures', () => {
  const nfts = createNftSeed()

  it('has at least 48 NFTs that parse exactly with the contract schemas', () => {
    expect(nfts.length).toBeGreaterThanOrEqual(48)
    for (const nft of nfts) {
      expectExactParse(nftDetailSchema, nft)
      expectExactParse(nftSummarySchema, toSummary(nft))
    }
  })

  it('has unique ids, slugs and edition ids', () => {
    expect(new Set(nfts.map((n) => n.id)).size).toBe(nfts.length)
    expect(new Set(nfts.map((n) => n.slug)).size).toBe(nfts.length)
    const editionIds = nfts.flatMap((n) => n.editions.map((e) => e.id))
    expect(new Set(editionIds).size).toBe(editionIds.length)
  })

  it('covers every category and network', () => {
    for (const category of CATEGORIES) expect(nfts.some((n) => n.category === category)).toBe(true)
    for (const network of NETWORKS) expect(nfts.some((n) => n.network === network)).toBe(true)
  })

  it('spreads prices from 0.02 to 12.30 ETH using canonical strings', () => {
    const sorted = [...nfts].sort((a, b) => compareEth(a.price, b.price))
    expect(sorted[0]?.price).toBe('0.02')
    expect(sorted.at(-1)?.price).toBe('12.3')
    expect(nfts.some((n) => n.previousPrice !== null)).toBe(true)
    for (const n of nfts) {
      if (n.previousPrice !== null) expect(compareEth(n.previousPrice, n.price)).toBe(1)
    }
  })

  it('includes new/trending/featured flags and all edition kinds', () => {
    expect(nfts.some((n) => n.flags.isNew)).toBe(true)
    expect(nfts.some((n) => n.flags.isTrending)).toBe(true)
    expect(nfts.some((n) => n.flags.isFeatured)).toBe(true)
    const kinds = new Set(nfts.flatMap((n) => n.editions.map((e) => e.kind)))
    expect(kinds).toEqual(new Set(['unique', 'limited', 'open']))
  })

  it('has a sold-out edition on an available NFT and an unavailable NFT', () => {
    expect(nfts.some((n) => n.totalAvailable > 0 && n.editions.some((e) => e.available === 0))).toBe(true)
    expect(nfts.some((n) => n.totalAvailable === 0)).toBe(true)
    for (const n of nfts) expect(n.totalAvailable).toBe(n.editions.reduce((s, e) => s + e.available, 0))
  })

  it('matches the Figma names and prices', () => {
    const byName = (name: string) => nfts.find((n) => n.name === name)
    expect(byName('Emerald Ape #042')).toMatchObject({ price: '1.19', tokenId: '#0042', slug: 'emerald-ape-042' })
    expect(byName('Emerald Ape #042')?.editions.map((e) => e.label)).toEqual(['1/1', '1/10', '1/50', 'ABERTA'])
    expect(byName('Emerald Ape #042')?.rating.count).toBe(19)
    expect(byName('Sage Nomad #009')).toMatchObject({ price: '1.69', flags: { isFeatured: true } })
    expect(byName('Neon Vessel #552')).toMatchObject({ price: '1.99', previousPrice: '2.29' })
    expect(byName('Golden Beat #207')?.price).toBe('0.99')
    expect(byName('Golden Signal #160')?.price).toBe('0.39')
    for (const n of nfts) expect(n.image.url).toMatch(/^\/nfts\/[a-z-]+\.webp$/)
    expect(new Set(nfts.map((n) => n.image.url))).toEqual(
      new Set(['/nfts/emerald-ape.webp', '/nfts/sage-nomad.webp', '/nfts/ivory-baron.webp', '/nfts/golden-beat.webp']),
    )
  })

  it('uses the design art and the real intrinsic size of each file', () => {
    const art = (name: string) => nfts.find((n) => n.name === name)?.image.url
    expect(art('Emerald Ape #042')).toBe('/nfts/emerald-ape.webp')
    for (const name of ['Sage Nomad #009', 'Cosmic Bloom #118', 'Violet Nomad #314'])
      expect(art(name)).toBe('/nfts/sage-nomad.webp')
    for (const name of ['Neon Vessel #552', 'Ivory Baron #088']) expect(art(name)).toBe('/nfts/ivory-baron.webp')
    for (const name of ['Golden Beat #207', 'Golden Signal #160']) expect(art(name)).toBe('/nfts/golden-beat.webp')
    const size: Record<string, number> = {
      '/nfts/emerald-ape.webp': 430,
      '/nfts/sage-nomad.webp': 236,
      '/nfts/ivory-baron.webp': 236,
      '/nfts/golden-beat.webp': 236,
    }
    for (const n of [...nfts, ...nfts.flatMap((x) => x.gallery.map((g) => ({ image: g })))]) {
      expect(n.image.width).toBe(size[n.image.url])
      expect(n.image.height).toBe(size[n.image.url])
    }
  })

  it('is deterministic and never uses Math.random or Date.now', () => {
    const random = vi.spyOn(Math, 'random')
    const now = vi.spyOn(Date, 'now')
    const first = createSeedState()
    const second = createSeedState()
    expect(random).not.toHaveBeenCalled()
    expect(now).not.toHaveBeenCalled()
    expect(second).toStrictEqual(first)
    expect(second.nfts).not.toBe(first.nfts)
    random.mockRestore()
    now.mockRestore()
  })
})

describe('seeded users', () => {
  it('has two users that parse exactly and store only salted hashes', async () => {
    expect(SEED_USERS).toHaveLength(2)
    for (const record of SEED_USERS) expectExactParse(userRecordSchema, record)
    const serialized = JSON.stringify(createSeedState().users)
    expect(serialized).not.toContain(DEMO_CREDENTIALS.collector.password)
    expect(serialized).not.toContain(DEMO_CREDENTIALS.creator.password)

    const [collector, creator] = SEED_USERS
    expect(collector?.user.email).toBe(DEMO_CREDENTIALS.collector.email)
    expect(await hashPassword(DEMO_CREDENTIALS.collector.password, collector?.passwordSalt ?? '')).toBe(
      collector?.passwordHash,
    )
    expect(await verifyPassword(DEMO_CREDENTIALS.creator.password, creator?.passwordSalt ?? '', creator?.passwordHash ?? '')).toBe(true)
    expect(await verifyPassword('wrong-password1', creator?.passwordSalt ?? '', creator?.passwordHash ?? '')).toBe(false)
  })
})

describe('mock db', () => {
  it('resetDb restores the exact seed after a mutation', () => {
    const seed = createSeedState()
    expect(patchNft('nft_001', { price: '9.99' }).ok).toBe(true)
    expect(findNft('nft_001')?.price).toBe('9.99')

    const generation = getDb().generation
    resetDb()

    expect(getDb().generation).toBe(generation + 1)
    expect(getDb().nfts).toStrictEqual(seed.nfts)
    expect(getDb().users).toStrictEqual(seed.users)
  })

  it('persists mutations and restores them on the next load (round trip)', () => {
    const storage = memoryStorage()
    initDb(storage)
    const result = patchNft('emerald-ape-042', { price: '2.5', editions: [{ id: 'nft_001-1of50', available: 0 }] })
    expect(result.ok).toBe(true)

    const raw = storage.data.get(DB_STORAGE_KEY)
    expect(raw).toBeDefined()
    expect(JSON.parse(raw ?? '{}')).toMatchObject({ schemaVersion: DB_SCHEMA_VERSION })

    // Simulate a reload: fresh in-memory state, then load from storage.
    initDb(undefined)
    resetDb()
    expect(findNft('nft_001')?.price).toBe('1.19')
    initDb(storage)

    const restored = findNft('nft_001')
    expect(restored?.price).toBe('2.5')
    expect(restored?.version).toBe(2)
    expect(restored?.editions.find((e) => e.id === 'nft_001-1of50')?.available).toBe(0)
  })

  it('reads never write to storage', () => {
    const storage = memoryStorage()
    initDb(storage)
    storage.setItem.mockClear()
    findNft('nft_001')
    void getDb().nfts.length
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it('falls back to the seed on schema-version mismatch and removes the stale snapshot', () => {
    const stale = createSeedState()
    stale.nfts[0] = { ...stale.nfts[0]!, price: '7.77' }
    const storage = memoryStorage({
      [DB_STORAGE_KEY]: JSON.stringify({ schemaVersion: DB_SCHEMA_VERSION + 1, state: stale }),
    })

    initDb(storage)

    expect(findNft('nft_001')?.price).toBe('1.19')
    expect(storage.data.has(DB_STORAGE_KEY)).toBe(false)
  })

  it('falls back to the seed on corrupt or contract-invalid snapshots', () => {
    initDb(memoryStorage({ [DB_STORAGE_KEY]: '{not json' }))
    expect(getDb().nfts).toStrictEqual(createSeedState().nfts)

    const invalid = createSeedState()
    invalid.nfts[0] = { ...invalid.nfts[0]!, price: 1.19 as unknown as string }
    initDb(memoryStorage({ [DB_STORAGE_KEY]: JSON.stringify({ schemaVersion: DB_SCHEMA_VERSION, state: invalid }) }))
    expect(findNft('nft_001')?.price).toBe('1.19')
  })

  it('resetDb clears the persisted snapshot', () => {
    const storage = memoryStorage()
    initDb(storage)
    patchNft('nft_002', { price: '3' })
    expect(storage.data.has(DB_STORAGE_KEY)).toBe(true)

    resetDb()

    expect(storage.data.has(DB_STORAGE_KEY)).toBe(false)
    expect(findNft('nft_002')?.price).toBe('1.69')
  })

  it('patchNft rejects edits that break edition invariants without committing', () => {
    const result = patchNft('nft_001', { editions: [{ id: 'nft_001-1of10', available: 11 }] })
    expect(result).toMatchObject({ ok: false, code: 'VALIDATION_ERROR' })
    expect(findNft('nft_001')?.version).toBe(1)
  })
})
