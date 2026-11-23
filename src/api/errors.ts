import { isAxiosError, isCancel } from 'axios'

/**
 * Error envelope returned by every API endpoint on failure (REST contract).
 *
 * ```json
 * { "error": { "code": "CART_LIMIT_EXCEEDED", "message": "Human readable", "details": {} } }
 * ```
 * `code` is a stable machine-readable identifier; `message` is safe to display;
 * `details` is endpoint specific (for example field errors on validation).
 */
export interface ErrorEnvelope {
  error: {
    code: string
    message: string
    details?: unknown
  }
}

export type ApiErrorKind =
  | 'validation' // 400, 422
  | 'unauthorized' // 401
  | 'forbidden' // 403
  | 'not_found' // 404
  | 'conflict' // 409, 412
  | 'transient' // 429, 5xx: server side, safe to retry
  | 'network' // no response (offline, connection refused)
  | 'timeout' // client timeout or 408
  | 'canceled' // aborted by the caller (AbortSignal); not a failure
  | 'unknown'

const RETRYABLE_KINDS: ReadonlySet<ApiErrorKind> = new Set(['transient', 'network', 'timeout'])

const DEFAULT_CODES: Record<ApiErrorKind, string> = {
  validation: 'VALIDATION_ERROR',
  unauthorized: 'UNAUTHORIZED',
  forbidden: 'FORBIDDEN',
  not_found: 'NOT_FOUND',
  conflict: 'CONFLICT',
  transient: 'SERVER_UNAVAILABLE',
  network: 'NETWORK_ERROR',
  timeout: 'TIMEOUT',
  canceled: 'CANCELED',
  unknown: 'UNKNOWN_ERROR',
}

const DEFAULT_MESSAGES: Record<ApiErrorKind, string> = {
  validation: 'The request is invalid.',
  unauthorized: 'You need to sign in to continue.',
  forbidden: 'You do not have permission to do this.',
  not_found: 'The requested resource was not found.',
  conflict: 'The resource changed. Refresh and try again.',
  transient: 'The service is temporarily unavailable. Try again.',
  network: 'Unable to reach the server. Check your connection.',
  timeout: 'The request took too long. Try again.',
  canceled: 'The request was canceled.',
  unknown: 'Something went wrong.',
}

export interface ApiErrorInit {
  kind: ApiErrorKind
  message?: string
  code?: string
  status?: number
  details?: unknown
  cause?: unknown
}

export class ApiError extends Error {
  override readonly name = 'ApiError'
  readonly kind: ApiErrorKind
  readonly code: string
  readonly status: number | undefined
  readonly details: unknown
  readonly retryable: boolean

  constructor(init: ApiErrorInit) {
    super(init.message ?? DEFAULT_MESSAGES[init.kind], { cause: init.cause })
    this.kind = init.kind
    this.code = init.code ?? DEFAULT_CODES[init.kind]
    this.status = init.status
    this.details = init.details
    this.retryable = RETRYABLE_KINDS.has(init.kind)
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError
}

export function isErrorEnvelope(value: unknown): value is ErrorEnvelope {
  if (typeof value !== 'object' || value === null || !('error' in value)) return false
  const error: unknown = value.error
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    'message' in error &&
    typeof error.message === 'string'
  )
}

export function kindFromStatus(status: number): ApiErrorKind {
  if (status === 400 || status === 422) return 'validation'
  if (status === 401) return 'unauthorized'
  if (status === 403) return 'forbidden'
  if (status === 404) return 'not_found'
  if (status === 409 || status === 412) return 'conflict'
  if (status === 408) return 'timeout'
  if (status === 429 || status >= 500) return 'transient'
  return 'unknown'
}

/** Converts anything thrown by the Axios pipeline into an `ApiError`. Idempotent. */
export function toApiError(error: unknown): ApiError {
  if (isApiError(error)) return error

  if (isCancel(error)) {
    return new ApiError({ kind: 'canceled', cause: error })
  }

  if (isAxiosError(error)) {
    // With `clarifyTimeoutError`, adapter timeouts surface as ETIMEDOUT.
    if (error.code === 'ETIMEDOUT') {
      return new ApiError({ kind: 'timeout', cause: error })
    }
    // ECONNABORTED without a timeout means the request was aborted (e.g. the
    // browser cancelled it on navigation). Client timeouts are classified
    // earlier by the Axios client via its timeout signal.
    if (error.code === 'ECONNABORTED') {
      return new ApiError({ kind: 'canceled', cause: error })
    }

    const response = error.response
    if (response) {
      const kind = kindFromStatus(response.status)
      const body: unknown = response.data
      if (isErrorEnvelope(body)) {
        return new ApiError({
          kind,
          status: response.status,
          code: body.error.code,
          message: body.error.message,
          details: body.error.details,
          cause: error,
        })
      }
      return new ApiError({ kind, status: response.status, cause: error })
    }

    return new ApiError({ kind: 'network', cause: error })
  }

  return new ApiError({
    kind: 'unknown',
    message: error instanceof Error ? error.message : undefined,
    cause: error,
  })
}
