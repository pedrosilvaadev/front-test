import type { CatalogQuery } from '@/contracts'

/**
 * Query key factory (ADR-004, docs/API_CONTRACTS.md "Cache and query keys").
 * Most general segment first; the last segment of a list key is the
 * normalized params object so equivalent URLs share one cache entry.
 * Catalog keys are public: their payloads never embed user-specific fields.
 */
export const queryKeys = {
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
