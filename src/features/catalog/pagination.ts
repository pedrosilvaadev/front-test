export type PageItem = number | 'gap-start' | 'gap-end'

/**
 * Numbered pagination items: all pages when there are at most 7, otherwise
 * first, last and a window around the current page, with gaps in between.
 * `pageItems(5, 10)` → `[1, 'gap-start', 4, 5, 6, 'gap-end', 10]`.
 */
export function pageItems(current: number, total: number): PageItem[] {
  if (total <= 0) return []
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const page = Math.min(Math.max(current, 1), total)
  const start = Math.max(2, Math.min(page - 1, total - 4))
  const end = Math.min(total - 1, Math.max(page + 1, 5))
  const items: PageItem[] = [1]
  if (start > 2) items.push('gap-start')
  for (let p = start; p <= end; p += 1) items.push(p)
  if (end < total - 1) items.push('gap-end')
  items.push(total)
  return items
}
