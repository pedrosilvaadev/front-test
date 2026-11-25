import { favoriteListSchema, favoriteStatusSchema, type FavoriteList, type FavoriteStatus } from '@/contracts'
import { apiClient } from './client'
import { userConfig, type UserRequestOptions } from './profile'

/** Favorites API (docs/API_CONTRACTS.md "Favorites"). Transport only; `token` pins the request to one user. */

export async function getFavorites(options: UserRequestOptions = {}): Promise<FavoriteList> {
  const { data } = await apiClient.get<unknown>('/favorites', userConfig(options))
  return favoriteListSchema.parse(data)
}

/** `PUT /api/favorites/:nftId` (idempotent); 404 `NFT_NOT_FOUND`. */
export async function addFavorite(nftId: string, options: UserRequestOptions = {}): Promise<FavoriteStatus> {
  const { data } = await apiClient.put<unknown>(`/favorites/${encodeURIComponent(nftId)}`, undefined, userConfig(options))
  return favoriteStatusSchema.parse(data)
}

/** `DELETE /api/favorites/:nftId` (idempotent). */
export async function removeFavorite(nftId: string, options: UserRequestOptions = {}): Promise<FavoriteStatus> {
  const { data } = await apiClient.delete<unknown>(`/favorites/${encodeURIComponent(nftId)}`, userConfig(options))
  return favoriteStatusSchema.parse(data)
}
