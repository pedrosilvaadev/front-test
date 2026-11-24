import { afterEach, describe, expect, it } from 'vitest'
import { createApiClient } from '@/api/client'
import { isApiError, type ApiError } from '@/api/errors'
import { authResponseSchema, sessionInfoSchema, type AuthResponse } from '@/contracts'
import { DEMO_CREDENTIALS } from '../fixtures/users'
import { getDb, initDb, resetDb, type DbStorage } from '../db'
import { setScenario } from '../scenario'
import { hashToken, SESSION_TTL_MS } from '../sessions'

// `skipAuth` keeps the app-wide session bridge out of these transport tests.
const client = createApiClient({ baseURL: '/api', timeoutMs: 5000 })
const bare = { skipAuth: true } as const
const bearer = (token: string) => ({ ...bare, headers: { Authorization: `Bearer ${token}` } })

async function captureError(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise
  } catch (error) {
    if (isApiError(error)) return error
    throw new Error(`Expected ApiError, got ${String(error)}`, { cause: error })
  }
  throw new Error('Expected request to fail')
}

async function loginAs(credentials: { email: string; password: string }): Promise<AuthResponse> {
  const { data, status } = await client.post<unknown>('/auth/login', credentials, bare)
  expect(status).toBe(200)
  return authResponseSchema.parse(data)
}

const NEW_USER = { username: 'Nova.Colecionadora', email: ' Nova.Colecionadora@Kurio.Test ', password: 'Segredo2026' }

afterEach(() => {
  initDb(undefined)
  resetDb()
})

describe('POST /api/auth/register', () => {
  it('creates the user with defaults, a salted hash and a session (201)', async () => {
    const before = Date.now()
    const response = await client.post<unknown>('/auth/register', NEW_USER, bare)
    expect(response.status).toBe(201)
    const body = authResponseSchema.parse(response.data)

    expect(body.cartMerge).toBeNull()
    expect(body.session.user).toMatchObject({
      username: 'nova.colecionadora',
      email: 'nova.colecionadora@kurio.test',
      displayName: 'nova.colecionadora',
      avatarUrl: null,
    })
    expect(body.session.token).toMatch(/^[0-9a-f]{64}$/)
    const ttl = Date.parse(body.session.expiresAt) - before
    expect(ttl).toBeGreaterThanOrEqual(SESSION_TTL_MS - 1000)
    expect(ttl).toBeLessThanOrEqual(SESSION_TTL_MS + 1000)

    const record = getDb().users.find((u) => u.user.email === 'nova.colecionadora@kurio.test')
    expect(record?.passwordHash).toMatch(/^[0-9a-f]{64}$/)
    expect(record?.passwordSalt).toMatch(/^[0-9a-f]{32}$/)
    const serialized = JSON.stringify(getDb())
    expect(serialized).not.toContain(NEW_USER.password)
    // Only the token hash is stored server side.
    expect(serialized).not.toContain(body.session.token)
    expect(getDb().sessions.map((s) => s.tokenHash)).toContain(await hashToken(body.session.token))

    // The new account can sign in.
    const login = await loginAs({ email: NEW_USER.email, password: NEW_USER.password })
    expect(login.session.user.id).toBe(body.session.user.id)
  })

  it('accepts a guestCartId and reports no merge yet', async () => {
    const response = await client.post<unknown>(
      '/auth/register',
      { ...NEW_USER, guestCartId: '3f2b8c1e-8a4d-4c2b-9f1e-2a3b4c5d6e7f' },
      bare,
    )
    expect(authResponseSchema.parse(response.data).cartMerge).toBeNull()
  })

  it('rejects invalid bodies with VALIDATION_ERROR field errors (422)', async () => {
    const error = await captureError(
      client.post('/auth/register', { username: 'a', email: 'x', password: 'short' }, bare),
    )
    expect(error).toMatchObject({ status: 422, code: 'VALIDATION_ERROR' })
    const fieldErrors = (error.details as { fieldErrors: Record<string, string[]> }).fieldErrors
    expect(Object.keys(fieldErrors).sort()).toEqual(['email', 'password', 'username'])
  })

  it('rejects malformed JSON (400 INVALID_JSON)', async () => {
    const error = await captureError(
      client.post('/auth/register', '{nope', {
        ...bare,
        headers: { 'Content-Type': 'application/json' },
        // Send the raw string (Axios would otherwise JSON-encode it as a valid string literal).
        transformRequest: [(data: unknown) => data],
      }),
    )
    expect(error).toMatchObject({ status: 400, code: 'INVALID_JSON' })
  })

  it('reports EMAIL_TAKEN / USERNAME_TAKEN with field errors (409)', async () => {
    const email = await captureError(
      client.post('/auth/register', { ...NEW_USER, email: DEMO_CREDENTIALS.collector.email }, bare),
    )
    expect(email).toMatchObject({ status: 409, code: 'EMAIL_TAKEN', details: { fieldErrors: { email: expect.any(Array) } } })

    const username = await captureError(client.post('/auth/register', { ...NEW_USER, username: 'Nova.Sato' }, bare))
    expect(username).toMatchObject({
      status: 409,
      code: 'USERNAME_TAKEN',
      details: { fieldErrors: { username: expect.any(Array) } },
    })
    expect(getDb().users).toHaveLength(2)
  })
})

describe('POST /api/auth/login', () => {
  it('signs in a demo user (case-insensitive email) and issues distinct tokens', async () => {
    const first = await loginAs({ email: 'COLECIONADOR@kurio.test', password: DEMO_CREDENTIALS.collector.password })
    const second = await loginAs(DEMO_CREDENTIALS.collector)
    expect(first.session.user).toMatchObject({ id: 'usr_001', displayName: 'Kurio Collector' })
    expect(first.session.token).not.toBe(second.session.token)
  })

  it('answers INVALID_CREDENTIALS for a wrong password or unknown email (401)', async () => {
    for (const body of [
      { email: DEMO_CREDENTIALS.collector.email, password: 'errada123' },
      { email: 'ninguem@kurio.test', password: 'Qualquer2026' },
    ]) {
      const error = await captureError(client.post('/auth/login', body, bare))
      expect(error).toMatchObject({ kind: 'unauthorized', status: 401, code: 'INVALID_CREDENTIALS' })
    }
  })

  it('validates the body (422)', async () => {
    const error = await captureError(client.post('/auth/login', { email: 'not-an-email', password: '' }, bare))
    expect(error).toMatchObject({ status: 422, code: 'VALIDATION_ERROR' })
  })

  it('is affected by network scenarios like any other endpoint', async () => {
    setScenario('server-error')
    const error = await captureError(client.post('/auth/login', DEMO_CREDENTIALS.collector, bare))
    expect(error).toMatchObject({ kind: 'transient', code: 'INTERNAL_ERROR' })
  })
})

describe('GET /api/auth/session + POST /api/auth/logout', () => {
  it('returns the session for a valid bearer token', async () => {
    const { session } = await loginAs(DEMO_CREDENTIALS.creator)
    const { data } = await client.get<unknown>('/auth/session', bearer(session.token))
    expect(sessionInfoSchema.parse(data)).toEqual({ user: session.user, expiresAt: session.expiresAt })
  })

  it('answers UNAUTHORIZED without a token or with an unknown token', async () => {
    expect(await captureError(client.get('/auth/session', bare))).toMatchObject({ status: 401, code: 'UNAUTHORIZED' })
    expect(await captureError(client.get('/auth/session', bearer('f'.repeat(64))))).toMatchObject({
      status: 401,
      code: 'UNAUTHORIZED',
    })
  })

  it('revokes the token on logout, idempotently (204)', async () => {
    const { session } = await loginAs(DEMO_CREDENTIALS.collector)
    expect((await client.post('/auth/logout', undefined, bearer(session.token))).status).toBe(204)
    expect(await captureError(client.get('/auth/session', bearer(session.token)))).toMatchObject({
      code: 'UNAUTHORIZED',
    })
    expect((await client.post('/auth/logout', undefined, bearer(session.token))).status).toBe(204)
    expect((await client.post('/auth/logout', undefined, bare)).status).toBe(204)
  })

  it('logout of one session keeps the other sessions of the same user', async () => {
    const a = await loginAs(DEMO_CREDENTIALS.collector)
    const b = await loginAs(DEMO_CREDENTIALS.collector)
    await client.post('/auth/logout', undefined, bearer(a.session.token))
    expect((await client.get('/auth/session', bearer(b.session.token))).status).toBe(200)
  })
})

describe('session expiry', () => {
  it('the dev control expires sessions → SESSION_EXPIRED; reset clears them', async () => {
    const collector = await loginAs(DEMO_CREDENTIALS.collector)
    const creator = await loginAs(DEMO_CREDENTIALS.creator)

    const scoped = await client.post<{ expired: number }>('/__dev/sessions/expire', { userId: 'usr_001' })
    expect(scoped.data).toEqual({ expired: 1 })
    expect(await captureError(client.get('/auth/session', bearer(collector.session.token)))).toMatchObject({
      status: 401,
      code: 'SESSION_EXPIRED',
    })
    expect((await client.get('/auth/session', bearer(creator.session.token))).status).toBe(200)

    const all = await client.post<{ expired: number }>('/__dev/sessions/expire')
    expect(all.data).toEqual({ expired: 1 })
    expect(await captureError(client.get('/auth/session', bearer(creator.session.token)))).toMatchObject({
      code: 'SESSION_EXPIRED',
    })

    // Logout of an expired token is still 204.
    expect((await client.post('/auth/logout', undefined, bearer(creator.session.token))).status).toBe(204)

    await client.post('/__dev/reset')
    expect(getDb().sessions).toEqual([])
    expect(await captureError(client.get('/auth/session', bearer(collector.session.token)))).toMatchObject({
      code: 'UNAUTHORIZED',
    })
  })

  it('a session past its TTL is expired', async () => {
    const { session } = await loginAs(DEMO_CREDENTIALS.collector)
    const hash = await hashToken(session.token)
    const record = getDb().sessions.find((s) => s.tokenHash === hash)
    if (!record) throw new Error('session not stored')
    record.expiresAt = new Date(Date.now() - 1000).toISOString()
    expect(await captureError(client.get('/auth/session', bearer(session.token)))).toMatchObject({
      code: 'SESSION_EXPIRED',
    })
  })

  it('the dev control validates its body', async () => {
    expect(await captureError(client.post('/__dev/sessions/expire', { userId: 42 }))).toMatchObject({
      status: 422,
      code: 'VALIDATION_ERROR',
    })
  })
})

describe('persistence', () => {
  function memoryStorage(): DbStorage & { data: Map<string, string> } {
    const data = new Map<string, string>()
    return {
      data,
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => void data.set(key, value),
      removeItem: (key) => void data.delete(key),
    }
  }

  it('sessions and registered users survive a mock db reload', async () => {
    const storage = memoryStorage()
    initDb(storage)
    const { data } = await client.post<unknown>('/auth/register', NEW_USER, bare)
    const { session } = authResponseSchema.parse(data)

    // Simulate a page reload: fresh memory, then load the snapshot.
    initDb(undefined)
    resetDb()
    initDb(storage)

    expect((await client.get('/auth/session', bearer(session.token))).status).toBe(200)
  })

  it('honours a forced expiry or logout persisted by another tab', async () => {
    const storage = memoryStorage()
    initDb(storage)
    const expiring = await loginAs(DEMO_CREDENTIALS.collector)
    const revoked = await loginAs(DEMO_CREDENTIALS.creator)
    const bothActive = storage.data.get('kurio.mockDb') ?? ''

    // "Another tab" expires one session and revokes the other.
    await client.post('/__dev/sessions/expire', { userId: 'usr_001' })
    await client.post('/auth/logout', undefined, bearer(revoked.session.token))
    const afterOtherTab = storage.data.get('kurio.mockDb') ?? ''

    // "This tab" still holds the snapshot from before in memory.
    storage.data.set('kurio.mockDb', bothActive)
    initDb(storage)
    storage.data.set('kurio.mockDb', afterOtherTab)

    expect(await captureError(client.get('/auth/session', bearer(expiring.session.token)))).toMatchObject({
      code: 'SESSION_EXPIRED',
    })
    expect(await captureError(client.get('/auth/session', bearer(revoked.session.token)))).toMatchObject({
      code: 'UNAUTHORIZED',
    })
  })

  it('finds a session created by another tab (snapshot written after this tab loaded)', async () => {
    const storage = memoryStorage()
    initDb(storage)
    const snapshotBefore = storage.data.get('kurio.mockDb')
    const { session } = await loginAs(DEMO_CREDENTIALS.creator)
    const snapshotAfter = storage.data.get('kurio.mockDb')
    expect(snapshotAfter).toBeDefined()

    // "This tab" still has the old in-memory state; the other tab's write is in storage.
    if (snapshotBefore) storage.data.set('kurio.mockDb', snapshotBefore)
    else storage.data.delete('kurio.mockDb')
    initDb(storage)
    storage.data.set('kurio.mockDb', snapshotAfter ?? '')

    expect((await client.get('/auth/session', bearer(session.token))).status).toBe(200)
  })
})
