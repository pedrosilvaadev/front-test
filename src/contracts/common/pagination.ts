import { z } from 'zod'

/** Catalog grid shows 3x3 cards per page on desktop (Figma "Início"). */
export const DEFAULT_PAGE_SIZE = 9
export const MAX_PAGE_SIZE = 48

export const pageMetaSchema = z.object({
  page: z.int().min(1),
  pageSize: z.int().min(1).max(MAX_PAGE_SIZE),
  totalItems: z.int().min(0),
  /** `0` when `totalItems` is 0. A `page` beyond `totalPages` returns empty `items`, not 404. */
  totalPages: z.int().min(0),
})
export type PageMeta = z.infer<typeof pageMetaSchema>

/** Paginated list envelope: `{ items, page }`. */
export function paginatedSchema<T extends z.ZodType>(item: T) {
  return z.object({ items: z.array(item), page: pageMetaSchema })
}
