import { QueryClient } from '@tanstack/react-query'
import { createRouter, type RouterHistory } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

export interface RouterContext {
  queryClient: QueryClient
}

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
}

export function createAppRouter({ queryClient, history }: CreateAppRouterOptions) {
  return createRouter({
    routeTree,
    context: { queryClient },
    history,
    defaultPreload: 'intent',
    // Let TanStack Query own caching; loaders always defer to the query cache.
    defaultPreloadStaleTime: 0,
    scrollRestoration: true,
    parseSearch: parseFlatSearch,
    stringifySearch: stringifyFlatSearch,
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>
  }
}
