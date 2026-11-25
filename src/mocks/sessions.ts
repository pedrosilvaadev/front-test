import type { User } from '@/contracts'
import { getDb, reloadDb, updateDb, type SessionRecord } from './db'
import type { UserRecord } from './fixtures/users'

/**
 * Simulated server-side session store (ADR-005): opaque random bearer tokens
 * with a TTL, persisted in the mock db as SHA-256 hashes only. Logout deletes
 * the record (idempotent); a dev control can force expiry for tests.
 */

/** Session lifetime. Long enough for a demo; expiry is exercised with the dev control. */
export const SESSION_TTL_MS = 2 * 60 * 60 * 1000
/** Expired records are kept this long (to answer `SESSION_EXPIRED`) before being pruned. */
export const EXPIRED_RETENTION_MS = 24 * 60 * 60 * 1000

const TOKEN_BYTES = 32

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Random hex string from the Web Crypto CSPRNG (tokens, salts, ids). */
export function randomHex(byteLength: number): string {
  return toHex(globalThis.crypto.getRandomValues(new Uint8Array(byteLength)))
}

export async function hashToken(token: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return toHex(new Uint8Array(digest))
}

export interface IssuedSession {
  token: string
  expiresAt: string
  user: User
}

/** Creates a session for `userId` and prunes long-expired records. */
export async function createSession(record: UserRecord, now = Date.now()): Promise<IssuedSession> {
  const token = randomHex(TOKEN_BYTES)
  const tokenHash = await hashToken(token)
  const expiresAt = new Date(now + SESSION_TTL_MS).toISOString()
  const session: SessionRecord = {
    tokenHash,
    userId: record.user.id,
    createdAt: new Date(now).toISOString(),
    expiresAt,
  }
  // Another tab may have written sessions/users since this tab loaded the db.
  reloadDb()
  updateDb((state) => {
    state.sessions = [
      ...state.sessions.filter((s) => Date.parse(s.expiresAt) + EXPIRED_RETENTION_MS > now),
      session,
    ]
  })
  return { token, expiresAt, user: structuredClone(record.user) }
}

/** Deletes the session of `token` if it exists. Unknown/expired tokens are a no-op. */
export async function revokeSession(token: string): Promise<boolean> {
  const tokenHash = await hashToken(token)
  reloadDb()
  if (!getDb().sessions.some((s) => s.tokenHash === tokenHash)) return false
  updateDb((state) => {
    state.sessions = state.sessions.filter((s) => s.tokenHash !== tokenHash)
  })
  return true
}

/**
 * Dev control: marks active sessions as expired (all, or only those of
 * `userId`). Returns how many sessions were expired.
 */
export function expireSessions({ userId }: { userId?: string } = {}, now = Date.now()): number {
  reloadDb()
  const expiredAt = new Date(now - 1).toISOString()
  return updateDb((state) => {
    let count = 0
    state.sessions = state.sessions.map((s) => {
      const active = Date.parse(s.expiresAt) > now
      if (!active || (userId !== undefined && s.userId !== userId)) return s
      count += 1
      return { ...s, expiresAt: expiredAt }
    })
    return count
  })
}

export type AuthenticateResult =
  | { ok: true; token: string; session: SessionRecord; record: UserRecord }
  | { ok: false; code: 'UNAUTHORIZED' | 'SESSION_EXPIRED' }

/** Extracts the token of an `Authorization: Bearer <token>` header. */
export function readBearerToken(request: Request): string | null {
  const header = request.headers.get('authorization')
  const match = header ? /^Bearer\s+(\S+)\s*$/i.exec(header) : null
  return match?.[1] ?? null
}

function lookup(tokenHash: string): { session: SessionRecord; record: UserRecord | undefined } | undefined {
  const db = getDb()
  const session = db.sessions.find((s) => s.tokenHash === tokenHash)
  if (!session) return undefined
  return { session, record: db.users.find((u) => u.user.id === session.userId) }
}

/**
 * Resolves the bearer token of a request (shared by every `user`/`owner`
 * endpoint): missing/unknown/revoked token → `UNAUTHORIZED`, expired →
 * `SESSION_EXPIRED`. The persisted snapshot is re-read before the lookup, so
 * sessions created, revoked or expired by another tab are honoured.
 */
export async function authenticate(request: Request, now = Date.now()): Promise<AuthenticateResult> {
  const token = readBearerToken(request)
  if (!token) return { ok: false, code: 'UNAUTHORIZED' }
  return authenticateToken(token, now)
}

/** Same rules as `authenticate` for a raw token (Socket.IO handshake `auth.token`, P5-01). */
export async function authenticateToken(token: string, now = Date.now()): Promise<AuthenticateResult> {
  const tokenHash = await hashToken(token)
  // Each tab runs its own mock server: re-read the persisted snapshot first so a
  // login, logout, forced expiry or reset done in another tab is honoured.
  reloadDb()
  const found = lookup(tokenHash)
  if (!found?.record) return { ok: false, code: 'UNAUTHORIZED' }
  if (Date.parse(found.session.expiresAt) <= now) return { ok: false, code: 'SESSION_EXPIRED' }
  return { ok: true, token, session: found.session, record: found.record }
}
