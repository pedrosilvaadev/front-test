import { HttpResponse } from 'msw'
import type { ErrorEnvelope } from '@/api/errors'

/** Mock API path prefix. Only same-origin `/api/...` requests are ever mocked. */
export const API_PREFIX = '/api'
export const DEV_PREFIX = `${API_PREFIX}/__dev`

/**
 * Origin the mocked API lives on: the app's own origin in the browser/jsdom.
 * Anchoring matchers to it prevents `*` wildcards from capturing Vite module
 * URLs (`/src/api/client.ts`) or third-party URLs that contain `/api/`.
 */
export const MOCK_ORIGIN: string = globalThis.location?.origin ?? 'http://localhost'

/** Absolute MSW path for an API route, e.g. `apiPath('/health')`. */
export function apiPath(path: string): string {
  return `${MOCK_ORIGIN}${API_PREFIX}${path}`
}

/** Matches every API route (used by the scenario middleware and the browser fallback). */
export const API_ROUTE_PATTERN = apiPath('/*')

/** Defensive runtime guard mirroring `API_ROUTE_PATTERN`. */
export function isMockApiUrl(url: string | URL): boolean {
  const parsed = typeof url === 'string' ? new URL(url) : url
  return parsed.origin === MOCK_ORIGIN && parsed.pathname.startsWith(`${API_PREFIX}/`)
}

/** Builds a response that follows the documented error envelope contract. */
export function errorResponse(
  status: number,
  code: string,
  message: string,
  details?: unknown,
): HttpResponse<ErrorEnvelope> {
  const body: ErrorEnvelope = {
    error: details === undefined ? { code, message } : { code, message, details },
  }
  return HttpResponse.json(body, { status })
}
