import { MutationObserver, QueryClient } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { createApiClient } from '@/api/client'
import { authResponseSchema, type FavoriteList, type NftSummary } from '@/contracts'
import { toSummary } from '@/mocks/catalog'
import { findNft } from '@/mocks/db'
import { DEMO_CREDENTIALS } from '@/mocks/fixtures/users'
import { apiPath } from '@/mocks/http'
import { server } from '@/mocks/node'
import { queryKeys } from '@/lib/query-keys'
import { applyFavorite, favoriteToggleOptions, FavoritesOwnerChangedError, rollbackFavorite, type ToggleVariables } from './favorites-queries'

const client = createApiClient({ baseURL: '/api', timeoutMs: 5000 })

function summary(id: string): NftSummary {
  const nft = findNft(id)
  if (!nft) throw new Error(`missing ${id}`)
  return toSummary(nft)
}

async function setup(userId = 'usr_001') {
  const { data } = await client.post<unknown>('/auth/login', DEMO_CREDENTIALS.collector, { skipAuth: true })
  const token = authResponseSchema.parse(data).session.token
  let currentUser = userId
  const manager = { getToken: () => token, getUserId: () => currentUser }
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const key = queryKeys.user.favorites('usr_001')
  const observer = () => new MutationObserver(queryClient, favoriteToggleOptions(queryClient, manager))
  const run = (vars: ToggleVariables) => observer().mutate(vars).catch((error: unknown) => error)
  return { queryClient, key, run, switchUser: (id: string) => (currentUser = id) }
}

describe('favorite list patches', () => {
  it('adds newest first and restores only the failed NFT', () => {
    const a = summary('nft_001')
    const b = summary('nft_002')
    const list: FavoriteList = applyFavorite(applyFavorite(undefined, a, true, 1), b, true, 2)
    expect(list.items.map((i) => i.nftId)).toEqual(['nft_002', 'nft_001'])
    const removed = applyFavorite(list, a, false)
    const restored = rollbackFavorite(removed, a.id, { previous: list.items[1], index: 1 })
    expect(restored).toEqual(list)
  })
})

describe('optimistic favorite toggle', () => {
  it('applies optimistically and persists on success', async () => {
    const { queryClient, key, run } = await setup()
    queryClient.setQueryData<FavoriteList>(key, { items: [] })
    const pending = run({ userId: 'usr_001', nft: summary('nft_001'), favorite: true })
    await vi.waitFor(() =>
      expect(queryClient.getQueryData<FavoriteList>(key)?.items.map((i) => i.nftId)).toEqual(['nft_001']),
    )
    expect(await pending).toEqual({ nftId: 'nft_001', favorited: true })
  })

  it('rolls back on a server error without touching other favorites', async () => {
    const { queryClient, key, run } = await setup()
    const other = applyFavorite(undefined, summary('nft_002'), true, 5)
    queryClient.setQueryData<FavoriteList>(key, other)
    server.use(
      http.put(apiPath('/favorites/:nftId'), () =>
        HttpResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'boom' } }, { status: 500 }),
      ),
    )
    const error = await run({ userId: 'usr_001', nft: summary('nft_001'), favorite: true })
    expect((error as { code?: string }).code).toBe('INTERNAL_ERROR')
    expect(queryClient.getQueryData<FavoriteList>(key)).toEqual(other)
  })

  it('restores a removed favorite at its position on error', async () => {
    const { queryClient, key, run } = await setup()
    const list = applyFavorite(applyFavorite(undefined, summary('nft_001'), true, 1), summary('nft_002'), true, 2)
    queryClient.setQueryData<FavoriteList>(key, list)
    server.use(http.delete(apiPath('/favorites/:nftId'), () => HttpResponse.error()))
    await run({ userId: 'usr_001', nft: summary('nft_001'), favorite: false })
    expect(queryClient.getQueryData<FavoriteList>(key)).toEqual(list)
  })

  it('never sends or writes for a user that is no longer signed in', async () => {
    const { queryClient, key, run, switchUser } = await setup()
    queryClient.setQueryData<FavoriteList>(key, { items: [] })
    switchUser('usr_002')
    const error = await run({ userId: 'usr_001', nft: summary('nft_001'), favorite: true })
    expect(error).toBeInstanceOf(FavoritesOwnerChangedError)
    expect(queryClient.getQueryData<FavoriteList>(key)).toEqual({ items: [] })
  })
})
