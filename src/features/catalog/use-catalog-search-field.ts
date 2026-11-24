import { useLocation, useRouter } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { parseCatalogSearch } from './catalog-search'
import { useCatalogQuery, useUpdateCatalog } from './use-catalog'

/** One URL update per typing pause. */
export const SEARCH_DEBOUNCE_MS = 350

function normalizeQ(value: string): string | undefined {
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

export interface CatalogSearchField {
  value: string
  onChange: (next: string) => void
  /** Applies the current text immediately (form submit) as a new history entry. */
  submit: () => void
}

/**
 * State for a header search field bound to the catalog `?q=` (mobile and
 * desktop headers). The header never unmounts, so a pending debounce must not
 * outlive the page it was typed on:
 *  - the timer is cancelled whenever the pathname changes (and on unmount);
 *  - when it fires it re-checks the router's current pathname and drops the
 *    update if the user navigated away in between.
 * Typing on the home route replaces the history entry; from any other route
 * the (deliberate) search navigates to `/` with a new entry. The field adopts
 * external URL changes (back/forward, "Limpar filtros") without rewriting text
 * that already means the same query (e.g. a trailing space).
 */
export function useCatalogSearchField(debounceMs = SEARCH_DEBOUNCE_MS): CatalogSearchField {
  const router = useRouter()
  const pathname = useLocation({ select: (location) => location.pathname })
  const query = useCatalogQuery()
  const update = useUpdateCatalog()
  const [value, setValue] = useState(query.q ?? '')
  const [syncedQ, setSyncedQ] = useState(query.q)
  const timer = useRef<number | undefined>(undefined)

  if (syncedQ !== query.q) {
    setSyncedQ(query.q)
    if (normalizeQ(value) !== query.q) setValue(query.q ?? '')
  }

  const cancel = useCallback(() => {
    window.clearTimeout(timer.current)
    timer.current = undefined
  }, [])

  // Cleanup runs on every pathname change and on unmount.
  useEffect(() => cancel, [pathname, cancel])

  const commit = useCallback(
    (text: string, debounced: boolean) => {
      cancel()
      const location = router.state.location
      const onHome = location.pathname === '/'
      const q = normalizeQ(text)
      if (onHome && q === parseCatalogSearch(location.search as Record<string, unknown>).q) return
      void update({ q }, { replace: debounced && onHome })
    },
    [cancel, router, update],
  )

  const onChange = useCallback(
    (next: string) => {
      setValue(next)
      cancel()
      const scheduledOn = router.state.location.pathname
      timer.current = window.setTimeout(() => {
        timer.current = undefined
        if (router.state.location.pathname !== scheduledOn) return
        commit(next, true)
      }, debounceMs)
    },
    [cancel, commit, debounceMs, router],
  )

  const submit = useCallback(() => commit(value, false), [commit, value])

  return { value, onChange, submit }
}
