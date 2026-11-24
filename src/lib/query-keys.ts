import type { CatalogQuery, Network } from '@/contracts'

/** Cart owner segment: `user:<id>` or `guest:<uuid>` (ADR-004). */
export type CartOwnerKey = `user:${string}` | `guest:${string}`

/**
 * Query key factory (ADR-004, docs/API_CONTRACTS.md "Cache and query keys").
 * Most general segment first; the last segment of a list key is the
 * normalized params object so equivalent URLs share one cache entry.
 * Catalog keys are public: their payloads never embed user-specific fields.
 */
export const queryKeys = {
  /** Current session (`SessionInfo | null`); per tab, value carries `user.id`. */
  session: () => ['session'] as const,
  /** Prefix of every private, user-scoped key (`['user', userId, ...]`). */
  user: { all: ['user'] as const },
  /** Prefix of every owner-scoped cart/quote key (`['cart', ownerKey, ...]`). */
  cart: {
    all: ['cart'] as const,
    owner: (ownerKey: CartOwnerKey) => ['cart', ownerKey] as const,
    quotes: (ownerKey: CartOwnerKey) => ['cart', ownerKey, 'quote'] as const,
    quote: (ownerKey: CartOwnerKey, params: { network: Network; cartVersion: number }) =>
      ['cart', ownerKey, 'quote', params] as const,
  },
  catalog: {
    all: ['catalog'] as const,
    lists: () => ['catalog', 'list'] as const,
    /** `query` must be normalized with `catalogQuerySchema` (see `parseCatalogSearch`). */
    list: (query: CatalogQuery) => ['catalog', 'list', query] as const,
    featured: () => ['catalog', 'featured'] as const,
    detail: (idOrSlug: string) => ['catalog', 'detail', idOrSlug] as const,
    related: (idOrSlug: string) => ['catalog', 'related', idOrSlug] as const,
  },
} as const
