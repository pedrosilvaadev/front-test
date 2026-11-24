import { useMatch, useNavigate } from '@tanstack/react-router'
import { useCallback, useMemo } from 'react'
import type { CatalogQuery } from '@/contracts/nfts'
import {
  applyCatalogPatch,
  parseCatalogSearch,
  toCatalogSearch,
  type CatalogPatch,
} from './catalog-search'

/**
 * Current catalog query, read from the URL of the home route. Outside the
 * home route (e.g. the mobile header on another page) it is the default
 * query, and catalog changes navigate to `/`.
 */
export function useCatalogQuery(): CatalogQuery {
  const search = useMatch({ from: '/', shouldThrow: false, select: (match) => match.search })
  // Memoize on content, not identity: the router may hand out a new object for the same search.
  const key = JSON.stringify(search ?? {})
  return useMemo(() => parseCatalogSearch(JSON.parse(key) as Record<string, unknown>), [key])
}

export interface UpdateCatalogOptions {
  /** `true` for high-frequency input (debounced typing) so history is not flooded. */
  replace?: boolean
}

/**
 * Writes a change to the URL. The patch is applied to the search of the
 * location being replaced (functional updater), so two quick changes compose
 * instead of the second overwriting the first. Any change other than `page`
 * resets pagination to 1. Scroll position is kept for filter changes.
 */
export function useUpdateCatalog() {
  const navigate = useNavigate()
  return useCallback(
    (patch: CatalogPatch, { replace = false }: UpdateCatalogOptions = {}) =>
      navigate({
        to: '/',
        search: (prev: Record<string, unknown>) =>
          toCatalogSearch(applyCatalogPatch(parseCatalogSearch(prev), patch)),
        replace,
        resetScroll: false,
      }),
    [navigate],
  )
}
