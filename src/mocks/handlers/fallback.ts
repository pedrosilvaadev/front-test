import { http } from 'msw'
import { API_ROUTE_PATTERN, errorResponse, isMockApiUrl } from '../http'

/**
 * Browser only, registered last: unknown same-origin `/api/*` routes answer
 * 404 with the error envelope instead of leaking to the dev/static server
 * (which would return HTML). Not used in Vitest, where unhandled requests
 * must fail loudly.
 */
export const unknownApiRouteHandler = http.all(API_ROUTE_PATTERN, ({ request }) => {
  const url = new URL(request.url)
  if (!isMockApiUrl(url)) return undefined
  return errorResponse(404, 'ROUTE_NOT_FOUND', `No mock handler for ${request.method} ${url.pathname}.`)
})
