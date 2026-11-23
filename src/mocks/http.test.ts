import { matchRequestUrl } from 'msw'
import { describe, expect, it } from 'vitest'
import { unknownApiRouteHandler } from './handlers/fallback'
import { API_ROUTE_PATTERN, apiPath, isMockApiUrl, MOCK_ORIGIN } from './http'
import { scenarioHandler } from './scenario'

const shouldMatch = [`${MOCK_ORIGIN}/api/health`, `${MOCK_ORIGIN}/api/nfts/1?x=1`, `${MOCK_ORIGIN}/api/__dev/reset`]
const shouldNotMatch = [
  // Vite dev module URLs that merely contain "/api/".
  `${MOCK_ORIGIN}/src/api/client.ts`,
  `${MOCK_ORIGIN}/src/api/errors.ts?t=123`,
  `${MOCK_ORIGIN}/node_modules/.vite/deps/api/x.js`,
  // Cross-origin URLs.
  'https://other.example/api/x',
  'https://cdn.example.com/v1/api/img.png',
  // Prefix look-alikes.
  `${MOCK_ORIGIN}/apix/health`,
]

describe('API route matching is anchored to the app origin and /api/', () => {
  it('the scenario middleware and the browser fallback share the anchored pattern', () => {
    expect(scenarioHandler.info.path).toBe(API_ROUTE_PATTERN)
    expect(unknownApiRouteHandler.info.path).toBe(API_ROUTE_PATTERN)
    expect(API_ROUTE_PATTERN).toBe(`${MOCK_ORIGIN}/api/*`)
    expect(apiPath('/health')).toBe(`${MOCK_ORIGIN}/api/health`)
  })

  it.each(shouldMatch)('matches %s', (url) => {
    expect(matchRequestUrl(new URL(url), API_ROUTE_PATTERN).matches).toBe(true)
    expect(isMockApiUrl(url)).toBe(true)
  })

  it.each(shouldNotMatch)('does not match %s', (url) => {
    expect(matchRequestUrl(new URL(url), API_ROUTE_PATTERN).matches).toBe(false)
    expect(isMockApiUrl(url)).toBe(false)
  })
})
