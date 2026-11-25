import { http, HttpResponse, type DefaultBodyType } from 'msw'
import type { ErrorEnvelope } from '@/api/errors'
import type { Favorite, FavoriteList, FavoriteStatus } from '@/contracts'
import { toSummary } from '../catalog'
import { findNft, getDb, updateDb } from '../db'
import { apiPath, errorResponse } from '../http'
import { requireUser } from './wallets'

/**
 * Favorites (docs/API_CONTRACTS.md "Favorites", P3-02). User-scoped: every
 * read/write is filtered by the authenticated user id. PUT/DELETE are
 * idempotent so an optimistic toggle can be retried safely.
 */

export function listFavorites(userId: string): FavoriteList {
  const items: Favorite[] = []
  const mine = getDb()
    .favorites.filter((record) => record.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  for (const record of mine) {
    const nft = findNft(record.nftId)
    if (nft) items.push({ nftId: record.nftId, createdAt: record.createdAt, nft: toSummary(nft) })
  }
  return { items }
}

/** Adds a favorite (no-op when it exists). Returns false when the NFT is unknown. */
export function addFavorite(userId: string, idOrSlug: string, now = Date.now()): { ok: true; nftId: string } | { ok: false } {
  const nft = findNft(idOrSlug)
  if (!nft) return { ok: false }
  if (!getDb().favorites.some((record) => record.userId === userId && record.nftId === nft.id)) {
    // Strictly increasing timestamps keep "newest first" stable for fast toggles.
    const last = getDb()
      .favorites.filter((record) => record.userId === userId)
      .reduce((max, record) => Math.max(max, Date.parse(record.createdAt)), 0)
    const createdAt = new Date(Math.max(now, last + 1)).toISOString()
    updateDb((state) => {
      state.favorites = [...state.favorites, { userId, nftId: nft.id, createdAt }]
    })
  }
  return { ok: true, nftId: nft.id }
}

export function removeFavorite(userId: string, idOrSlug: string): string {
  const nftId = findNft(idOrSlug)?.id ?? idOrSlug
  if (getDb().favorites.some((record) => record.userId === userId && record.nftId === nftId)) {
    updateDb((state) => {
      state.favorites = state.favorites.filter((record) => !(record.userId === userId && record.nftId === nftId))
    })
  }
  return nftId
}

type NftParams = { nftId: string }

export const favoriteHandlers = [
  http.get<never, DefaultBodyType, FavoriteList | ErrorEnvelope>(apiPath('/favorites'), async ({ request }) => {
    const user = await requireUser(request)
    if (!user.ok) return user.response
    return HttpResponse.json<FavoriteList>(listFavorites(user.userId))
  }),

  http.put<NftParams, DefaultBodyType, FavoriteStatus | ErrorEnvelope>(apiPath('/favorites/:nftId'), async ({ request, params }) => {
    const user = await requireUser(request)
    if (!user.ok) return user.response
    const result = addFavorite(user.userId, params.nftId)
    if (!result.ok) return errorResponse(404, 'NFT_NOT_FOUND', 'NFT not found.', { idOrSlug: params.nftId })
    return HttpResponse.json<FavoriteStatus>({ nftId: result.nftId, favorited: true })
  }),

  // Idempotent: removing a missing favorite also answers 200.
  http.delete<NftParams, DefaultBodyType, FavoriteStatus | ErrorEnvelope>(apiPath('/favorites/:nftId'), async ({ request, params }) => {
    const user = await requireUser(request)
    if (!user.ok) return user.response
    const nftId = removeFavorite(user.userId, params.nftId)
    return HttpResponse.json<FavoriteStatus>({ nftId, favorited: false })
  }),
]
