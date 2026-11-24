/**
 * Post-auth redirect handling for `/login` and `/cadastro` (`?redirect=`).
 * Only same-origin relative paths are accepted: anything else (absolute
 * URLs, protocol-relative `//host`, backslash tricks, control characters,
 * auth pages themselves) falls back to `/`, so the param cannot be used as
 * an open redirect or to build a redirect loop.
 */

export const DEFAULT_REDIRECT = '/'
const MAX_REDIRECT_LENGTH = 2048
const AUTH_PATHS: ReadonlySet<string> = new Set(['/login', '/cadastro'])
/** Placeholder origin used only to parse and normalize the path. */
const PARSE_BASE = 'http://redirect.invalid'

/**
 * A rooted, single-slash path without backslashes or control/whitespace
 * characters (`//host` and `/\host` are protocol-relative in browsers; the
 * others are normalized away by URL parsers).
 */
function isRootedPath(value: string): boolean {
  if (value.length === 0 || value.length > MAX_REDIRECT_LENGTH) return false
  if (!value.startsWith('/') || value.startsWith('//')) return false
  // eslint-disable-next-line no-control-regex
  return !/[\\\u0000- \u007f]/.test(value)
}

export function sanitizeRedirect(value: unknown): string {
  if (typeof value !== 'string' || !isRootedPath(value)) return DEFAULT_REDIRECT
  let url: URL
  try {
    url = new URL(value, PARSE_BASE)
  } catch {
    return DEFAULT_REDIRECT
  }
  if (url.origin !== PARSE_BASE) return DEFAULT_REDIRECT
  const result = `${url.pathname}${url.search}${url.hash}`
  // Dot segments normalize `/.//evil.com` or `/a/..//evil.com` into `//evil.com`:
  // the normalized result must pass the same checks as the input.
  if (!isRootedPath(result)) return DEFAULT_REDIRECT
  const path = url.pathname.replace(/\/+$/, '') || '/'
  if (AUTH_PATHS.has(path)) return DEFAULT_REDIRECT
  return result
}

/** Why the user was sent to the login page. */
export type AuthReason = 'expired'

export interface AuthSearch {
  /** Sanitized target; omitted when it is the default (`/`). */
  redirect?: string
  reason?: AuthReason
}

/**
 * `validateSearch` for the auth routes (ADR-007: values arrive as strings,
 * repeated keys as arrays → last value wins). Both keys are always returned
 * (`undefined` when absent/invalid): TanStack merges a route's validated
 * search over the raw parent search, so omitting a key would let the raw,
 * unsanitized value through to `useSearch()`.
 */
export function validateAuthSearch(search: Record<string, unknown>): AuthSearch {
  const last = (value: unknown) => (Array.isArray(value) ? (value.at(-1) as unknown) : value)
  const redirect = sanitizeRedirect(last(search.redirect))
  return {
    redirect: redirect === DEFAULT_REDIRECT ? undefined : redirect,
    reason: last(search.reason) === 'expired' ? 'expired' : undefined,
  }
}

/** Search for a link/redirect to `/login` that returns to `href` afterwards. */
export function loginSearch(href: string, reason?: AuthReason): AuthSearch {
  const redirect = sanitizeRedirect(href)
  return {
    ...(redirect === DEFAULT_REDIRECT ? {} : { redirect }),
    ...(reason ? { reason } : {}),
  }
}
