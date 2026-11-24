/**
 * Dependency-free link between the Axios client and the client session
 * (ADR-005). Kept tiny on purpose: the entry chunk imports it (through the
 * session manager) while Axios, the contracts and the API modules stay in
 * lazily loaded chunks. `src/api/client.ts` reads it on every request.
 *
 * - `getToken` supplies the bearer token for automatic `Authorization` headers.
 * - `onSessionRejected` is told when an authenticated request was answered
 *   with 401 `SESSION_EXPIRED`/`UNAUTHORIZED` (never `INVALID_CREDENTIALS`);
 *   `token` is the token that request carried, so stale responses of a
 *   previous session can be ignored.
 */
export interface AuthBridge {
  getToken: () => string | null
  onSessionRejected: (error: unknown, token: string) => void
}

let current: AuthBridge | null = null

/** Installs the bridge (one per app). Returns a disposer that only removes this bridge. */
export function setAuthBridge(bridge: AuthBridge): () => void {
  current = bridge
  return () => {
    if (current === bridge) current = null
  }
}

export function getAuthBridge(): AuthBridge | null {
  return current
}

/**
 * `ApiError.kind` without importing `src/api/errors` (which pulls Axios into
 * the importer's chunk). Returns `undefined` for anything that is not an ApiError.
 */
export function apiErrorKind(error: unknown): string | undefined {
  if (!(error instanceof Error) || error.name !== 'ApiError') return undefined
  const kind: unknown = (error as { kind?: unknown }).kind
  return typeof kind === 'string' ? kind : undefined
}

/** `ApiError.retryable` without importing `src/api/errors`. */
export function isRetryableApiError(error: unknown): boolean {
  return apiErrorKind(error) !== undefined && (error as { retryable?: unknown }).retryable === true
}
