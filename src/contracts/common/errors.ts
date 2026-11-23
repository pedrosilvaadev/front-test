import { z } from 'zod'
import type { ApiErrorKind, ErrorEnvelope } from '@/api/errors'

/**
 * Error code catalogue (docs/API_CONTRACTS.md, "Errors"). Every non-2xx
 * response carries `{ error: { code, message, details? } }`. The HTTP status
 * decides `ApiError.kind` (src/api/errors.ts `kindFromStatus`); the code
 * refines it. Clients branch on `code`, never on `message`.
 */
export const ERROR_CATALOGUE = {
  // 400/422 validation
  INVALID_JSON: { status: 400, kind: 'validation' },
  INVALID_QUERY: { status: 400, kind: 'validation' },
  IDEMPOTENCY_KEY_REQUIRED: { status: 400, kind: 'validation' },
  GUEST_CART_ID_REQUIRED: { status: 400, kind: 'validation' },
  VALIDATION_ERROR: { status: 422, kind: 'validation' },
  COUPON_INVALID: { status: 422, kind: 'validation' },
  COUPON_EXPIRED: { status: 422, kind: 'validation' },
  CURRENT_PASSWORD_INVALID: { status: 422, kind: 'validation' },
  UNKNOWN_SCENARIO: { status: 422, kind: 'validation' },
  // 401 unauthorized
  UNAUTHORIZED: { status: 401, kind: 'unauthorized' },
  SESSION_EXPIRED: { status: 401, kind: 'unauthorized' },
  INVALID_CREDENTIALS: { status: 401, kind: 'unauthorized' },
  // 403 forbidden
  FORBIDDEN: { status: 403, kind: 'forbidden' },
  // 404 not found
  NFT_NOT_FOUND: { status: 404, kind: 'not_found' },
  EDITION_NOT_FOUND: { status: 404, kind: 'not_found' },
  CART_ITEM_NOT_FOUND: { status: 404, kind: 'not_found' },
  QUOTE_NOT_FOUND: { status: 404, kind: 'not_found' },
  ORDER_NOT_FOUND: { status: 404, kind: 'not_found' },
  WALLET_NOT_FOUND: { status: 404, kind: 'not_found' },
  ROUTE_NOT_FOUND: { status: 404, kind: 'not_found' },
  // 409 conflict
  EMAIL_TAKEN: { status: 409, kind: 'conflict' },
  USERNAME_TAKEN: { status: 409, kind: 'conflict' },
  AVAILABILITY_CONFLICT: { status: 409, kind: 'conflict' },
  QUOTE_CHANGED: { status: 409, kind: 'conflict' },
  QUOTE_EXPIRED: { status: 409, kind: 'conflict' },
  IDEMPOTENCY_CONFLICT: { status: 409, kind: 'conflict' },
  PRIMARY_WALLET_REQUIRED: { status: 409, kind: 'conflict' },
  WALLET_NOT_CONNECTED: { status: 409, kind: 'conflict' },
  WALLET_CONNECTION_REJECTED: { status: 409, kind: 'conflict' },
  WALLET_NETWORK_MISMATCH: { status: 409, kind: 'conflict' },
  // 429/5xx transient (retryable). 503 uses the same code as the client default
  // for `transient` (src/api/errors.ts DEFAULT_CODES) so both layers agree.
  RATE_LIMITED: { status: 429, kind: 'transient' },
  INTERNAL_ERROR: { status: 500, kind: 'transient' },
  SERVER_UNAVAILABLE: { status: 503, kind: 'transient' },
} as const satisfies Record<string, { status: number; kind: ApiErrorKind }>

export type ErrorCode = keyof typeof ERROR_CATALOGUE

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && Object.hasOwn(ERROR_CATALOGUE, value)
}

/**
 * Envelope schema, structurally identical to `ErrorEnvelope` in src/api/errors.ts.
 * `code` stays an open string so unknown future codes still parse (forward
 * compatible); use `isErrorCode` to narrow.
 */
export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string(),
    details: z.unknown().optional(),
  }),
}) satisfies z.ZodType<ErrorEnvelope>

/**
 * `details` for VALIDATION_ERROR, EMAIL_TAKEN, USERNAME_TAKEN and
 * CURRENT_PASSWORD_INVALID: field path (dot separated) → messages.
 */
export const fieldErrorsDetailsSchema = z.object({
  fieldErrors: z.record(z.string(), z.array(z.string())),
  formErrors: z.array(z.string()).optional(),
})
export type FieldErrorsDetails = z.infer<typeof fieldErrorsDetailsSchema>

/** Converts a zod error into `fieldErrors` details (MSW handlers and forms share it). */
export function toFieldErrorsDetails(error: z.ZodError): FieldErrorsDetails {
  const fieldErrors: Record<string, string[]> = {}
  const formErrors: string[] = []
  for (const issue of error.issues) {
    if (issue.path.length === 0) {
      formErrors.push(issue.message)
      continue
    }
    const key = issue.path.map(String).join('.')
    const list = fieldErrors[key] ?? []
    list.push(issue.message)
    fieldErrors[key] = list
  }
  return formErrors.length > 0 ? { fieldErrors, formErrors } : { fieldErrors }
}
