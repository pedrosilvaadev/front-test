import { http, HttpResponse, type DefaultBodyType, type PathParams } from 'msw'
import type { ErrorEnvelope } from '@/api/errors'
import {
  loginRequestSchema,
  registerRequestSchema,
  toFieldErrorsDetails,
  type AuthResponse,
  type FieldErrorsDetails,
  type SessionInfo,
} from '@/contracts'
import { getDb, reloadDb, updateDb } from '../db'
import type { UserRecord } from '../fixtures/users'
import { mergeGuestCart } from '../cart-store'
import { apiPath, errorResponse } from '../http'
import { hashPassword, verifyPassword } from '../password'
import { authenticate, createSession, randomHex, readBearerToken, revokeSession } from '../sessions'

/** Salt used to burn the same hashing time when the email is unknown (no user enumeration by timing). */
const DUMMY_SALT = '00000000000000000000000000000000'

async function readJson(request: Request): Promise<{ ok: true; body: unknown } | { ok: false }> {
  try {
    return { ok: true, body: await request.json() }
  } catch {
    return { ok: false }
  }
}

function invalidJson() {
  return errorResponse(400, 'INVALID_JSON', 'Request body must be JSON.')
}

function nextUserId(users: readonly UserRecord[]): string {
  const max = users.reduce((highest, { user }) => {
    const match = /^usr_(\d+)$/.exec(user.id)
    return match ? Math.max(highest, Number(match[1])) : highest
  }, 0)
  return `usr_${String(max + 1).padStart(3, '0')}`
}

/**
 * ADR-006: the guest cart is merged into the user's cart as part of a
 * successful login/register (never on failure, so no data is lost).
 */
function authResponse(session: AuthResponse['session'], guestCartId: string | undefined): AuthResponse {
  const cartMerge = guestCartId ? mergeGuestCart(guestCartId, session.user.id) : null
  return { session, cartMerge }
}

/** Session and account endpoints (docs/API_CONTRACTS.md "Session and account"). */
export const authHandlers = [
  http.post<PathParams, DefaultBodyType, AuthResponse | ErrorEnvelope>(apiPath('/auth/register'), async ({ request }) => {
    const json = await readJson(request)
    if (!json.ok) return invalidJson()
    const parsed = registerRequestSchema.safeParse(json.body)
    if (!parsed.success) {
      return errorResponse(422, 'VALIDATION_ERROR', 'Invalid registration.', toFieldErrorsDetails(parsed.error))
    }
    const { username, email, password, guestCartId } = parsed.data

    reloadDb()
    const users = getDb().users
    const fieldErrors: FieldErrorsDetails['fieldErrors'] = {}
    if (users.some((u) => u.user.email === email)) fieldErrors.email = ['Email already registered.']
    if (users.some((u) => u.user.username === username)) fieldErrors.username = ['Username already taken.']
    if (fieldErrors.email) return errorResponse(409, 'EMAIL_TAKEN', 'Email already registered.', { fieldErrors })
    if (fieldErrors.username) return errorResponse(409, 'USERNAME_TAKEN', 'Username already taken.', { fieldErrors })

    const passwordSalt = randomHex(16)
    const passwordHash = await hashPassword(password, passwordSalt)
    const record: UserRecord = {
      // Registration defaults (docs/API_CONTRACTS.md): displayName = username, no avatar.
      user: { id: nextUserId(users), username, email, displayName: username, avatarUrl: null },
      passwordSalt,
      passwordHash,
      createdAt: new Date().toISOString(),
    }
    updateDb((state) => {
      state.users = [...state.users, record]
    })
    const session = await createSession(record)
    return HttpResponse.json<AuthResponse>(authResponse(session, guestCartId), { status: 201 })
  }),

  http.post<PathParams, DefaultBodyType, AuthResponse | ErrorEnvelope>(apiPath('/auth/login'), async ({ request }) => {
    const json = await readJson(request)
    if (!json.ok) return invalidJson()
    const parsed = loginRequestSchema.safeParse(json.body)
    if (!parsed.success) {
      return errorResponse(422, 'VALIDATION_ERROR', 'Invalid login.', toFieldErrorsDetails(parsed.error))
    }
    const { email, password, guestCartId } = parsed.data

    reloadDb()
    const record = getDb().users.find((u) => u.user.email === email)
    let valid = false
    if (record) valid = await verifyPassword(password, record.passwordSalt, record.passwordHash)
    else await hashPassword(password, DUMMY_SALT)
    if (!record || !valid) {
      // Same answer for unknown email and wrong password.
      return errorResponse(401, 'INVALID_CREDENTIALS', 'Invalid email or password.')
    }
    const session = await createSession(record)
    return HttpResponse.json<AuthResponse>(authResponse(session, guestCartId))
  }),

  http.get<PathParams, DefaultBodyType, SessionInfo | ErrorEnvelope>(apiPath('/auth/session'), async ({ request }) => {
    const auth = await authenticate(request)
    if (!auth.ok) {
      return auth.code === 'SESSION_EXPIRED'
        ? errorResponse(401, 'SESSION_EXPIRED', 'Session expired. Sign in again.')
        : errorResponse(401, 'UNAUTHORIZED', 'Authentication required.')
    }
    return HttpResponse.json<SessionInfo>({ user: structuredClone(auth.record.user), expiresAt: auth.session.expiresAt })
  }),

  // Idempotent: missing, unknown or expired tokens also answer 204.
  http.post(apiPath('/auth/logout'), async ({ request }) => {
    const token = readBearerToken(request)
    if (token) await revokeSession(token)
    return new HttpResponse(null, { status: 204 })
  }),
]
