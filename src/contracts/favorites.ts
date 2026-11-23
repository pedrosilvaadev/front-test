import { z } from 'zod'
import { idSchema, isoDateTimeSchema } from './common/primitives'
import { nftSummarySchema } from './nfts'

/**
 * Favorites (README §3 "Favoritos devem persistir para o usuário autenticado").
 * Auth required. The detail page derives "is favorite" from this list (keyed
 * by userId), never from the public NFT payload (ADR-004).
 */
export const favoriteSchema = z.object({
  nftId: idSchema,
  createdAt: isoDateTimeSchema,
  nft: nftSummarySchema,
})
export type Favorite = z.infer<typeof favoriteSchema>

/** `GET /api/favorites` → newest first. */
export const favoriteListSchema = z.object({ items: z.array(favoriteSchema) })
export type FavoriteList = z.infer<typeof favoriteListSchema>

/** `PUT /api/favorites/:nftId` → 200 (idempotent; repeating is a no-op). */
export const favoriteStatusSchema = z.object({ nftId: idSchema, favorited: z.boolean() })
export type FavoriteStatus = z.infer<typeof favoriteStatusSchema>
