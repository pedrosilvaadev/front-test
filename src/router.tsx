import { QueryClient } from '@tanstack/react-query'
import { createRouter, type RouterHistory } from '@tanstack/react-router'
import { loginSearch } from './features/auth/redirect'
import { createSessionManager, type SessionManager } from './features/auth/session-manager'
import { routeTree } from './routeTree.gen'

export interface RouterContext {
  queryClient: QueryClient
  /** Client session (ADR-005); one per app instance so tests stay isolated. */
  session: SessionManager
}

/** Route id of the pathless layout that guards private pages. */
export const AUTHED_ROUTE_ID = '/_authed'

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  })
}

/**
 * Flat query strings (no JSON encoding of values). TanStack's default
 * serializer JSON-quotes strings that look like JSON (`minPrice="1.5"` →
 * `minPrice=%221.5%22`) and turns `page=2` into a number; the catalog URL
 * contract (docs/API_CONTRACTS.md) is plain `key=value` strings validated per
 * route by `validateSearch`, so values are kept as strings both ways.
 */
const UNSAFE_SEARCH_KEYS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype'])

/**
 * Repeated keys are collected into an array; each route's `validateSearch`
 * decides how to read them (the catalog joins list params, last value wins
 * for scalars). Prototype-polluting keys are dropped and the result has no
 * prototype.
 */
export function parseFlatSearch(searchStr: string): Record<string, string | string[]> {
  const out = Object.create(null) as Record<string, string | string[]>
  for (const [key, value] of new URLSearchParams(searchStr)) {
    if (UNSAFE_SEARCH_KEYS.has(key)) continue
    if (!Object.hasOwn(out, key)) {
      out[key] = value
      continue
    }
    const previous = out[key]
    out[key] = Array.isArray(previous) ? [...previous, value] : [previous ?? '', value]
  }
  return out
}

export function stringifyFlatSearch(search: Record<string, unknown>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(search)) {
    if (value === undefined || value === null) continue
    params.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value))
  }
  // Commas are legal in query strings; keep csv lists readable.
  const searchStr = params.toString().replace(/%2C/gi, ',')
  return searchStr ? `?${searchStr}` : ''
}

interface CreateAppRouterOptions {
  queryClient: QueryClient
  history?: RouterHistory
  session?: SessionManager
}

export function createAppRouter({ queryClient, history, session = createSessionManager({ queryClient }) }: CreateAppRouterOptions) {
  const router = createRouter({
    routeTree,
    context: { queryClient, session },
    history,
    defaultPreload: 'intent',
    // Let TanStack Query own caching; loaders always defer to the query cache.
    defaultPreloadStaleTime: 0,
    scrollRestoration: true,
    parseSearch: parseFlatSearch,
    stringifySearch: stringifyFlatSearch,
  })

  // Session events that move the user (guards handle the navigation they trigger themselves).
  session.subscribe(({ reason, redirectToLogin }) => {
    const { location, matches } = router.state
    const onPrivateRoute = matches.some((match) => match.routeId === AUTHED_ROUTE_ID)
    if (redirectToLogin) {
      if (location.pathname === '/login' || location.pathname === '/cadastro') return
      void router.navigate({ to: '/login', search: loginSearch(location.href, 'expired'), replace: true })
      return
    }
    if ((reason === 'logout' || reason === 'remote-logout') && onPrivateRoute) {
      void router.navigate({ to: '/', replace: true })
      return
    }
    if (reason === 'remote-login') void router.invalidate()
  })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>
  }
}
