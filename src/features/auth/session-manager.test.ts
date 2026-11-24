import { QueryClient } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as authApi from '@/api/auth'
import { apiClient } from '@/api/client'
import { isApiError } from '@/api/errors'
import type { SessionInfo } from '@/contracts'
import { DEMO_CREDENTIALS } from '@/mocks/fixtures/users'
import { apiPath, errorResponse } from '@/mocks/http'
import { server } from '@/mocks/node'
import { createSessionManager, SESSION_STORAGE_KEY, type SessionEvent, type SessionManager } from './session-manager'

const managers: SessionManager[] = []

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  const session = createSessionManager({ queryClient })
  managers.push(session)
  const events: SessionEvent[] = []
  session.subscribe((event) => events.push(event))
  return { queryClient, session, events }
}

async function signInAs(session: SessionManager, credentials: { email: string; password: string }) {
  const response = await authApi.login(credentials)
  session.signIn(response.session)
  return response.session
}

/** Seeds private caches of the current user so clearing can be asserted. */
function seedPrivateCaches(queryClient: QueryClient) {
  queryClient.setQueryData(['user', 'usr_001', 'profile'], { secret: true })
  queryClient.setQueryData(['cart', 'user:usr_001'], { items: [] })
  queryClient.setQueryData(['catalog', 'featured'], { items: [] })
}

function expectPrivateCleared(queryClient: QueryClient) {
  expect(queryClient.getQueryCache().findAll({ queryKey: ['user'] })).toHaveLength(0)
  expect(queryClient.getQueryCache().findAll({ queryKey: ['cart'] })).toHaveLength(0)
  // Public data survives (ADR-004).
  expect(queryClient.getQueryData(['catalog', 'featured'])).toBeDefined()
}

afterEach(() => {
  for (const manager of managers.splice(0)) manager.dispose()
  window.localStorage.clear()
})

describe('session manager: sign-in and boot', () => {
  it('signIn stores token + user id (never the password) and seeds the session query', async () => {
    const { session, queryClient } = setup()
    const issued = await signInAs(session, DEMO_CREDENTIALS.collector)

    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY) ?? ''
    expect(JSON.parse(raw)).toEqual({ token: issued.token, userId: 'usr_001', expiresAt: issued.expiresAt })
    expect(raw).not.toContain(DEMO_CREDENTIALS.collector.password)
    expect(session.getToken()).toBe(issued.token)
    expect(queryClient.getQueryData<SessionInfo>(['session'])?.user.id).toBe('usr_001')
  })

  it('a stored valid token is revalidated on boot (new tab/reload)', async () => {
    const first = setup()
    await signInAs(first.session, DEMO_CREDENTIALS.creator)
    first.session.dispose()

    const { session } = setup()
    await expect(session.ensureSession()).resolves.toMatchObject({ user: { id: 'usr_002' } })
  })

  it('a stored invalid/expired token is dropped silently on boot', async () => {
    window.localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({ token: 'f'.repeat(64), userId: 'usr_001', expiresAt: '2030-01-01T00:00:00.000Z' }),
    )
    const { session, events } = setup()

    await expect(session.ensureSession()).resolves.toBeNull()
    expect(window.localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull()
    expect(session.getToken()).toBeNull()
    expect(events).toEqual([{ reason: 'invalid', redirectToLogin: false }])
    expect(session.takeEndReason()).toBe('invalid')
  })

  it('corrupt storage is ignored (guest)', async () => {
    window.localStorage.setItem(SESSION_STORAGE_KEY, '{not json')
    const { session } = setup()
    expect(session.getToken()).toBeNull()
    await expect(session.ensureSession()).resolves.toBeNull()
  })

  it('a guard revalidation in flight during a sign-in resolves with the new session (no CancelledError)', async () => {
    // Boot with a stored token: the session query has no data yet, so a
    // cancelled fetch rejects with CancelledError instead of reverting.
    const first = setup()
    await signInAs(first.session, DEMO_CREDENTIALS.collector)
    first.session.dispose()
    const { session } = setup()
    const next = await authApi.login(DEMO_CREDENTIALS.creator)

    const pending = session.revalidateSession()
    session.signIn(next.session)

    await expect(pending).resolves.toMatchObject({ user: { id: 'usr_002' } })
  })

  it('a guard revalidation cancelled without replacement data is retried once (no CancelledError)', async () => {
    const first = setup()
    await signInAs(first.session, DEMO_CREDENTIALS.collector)
    first.session.dispose()
    const { session, queryClient } = setup()

    const pending = session.revalidateSession()
    await queryClient.cancelQueries({ queryKey: ['session'] })

    await expect(pending).resolves.toMatchObject({ user: { id: 'usr_001' } })
  })

  it('sign-in and sign-out drop auth mutations (plaintext password variables) from the cache', async () => {
    const { session, queryClient } = setup()
    const mutationCache = queryClient.getMutationCache()
    const mutation = mutationCache.build(queryClient, { mutationFn: (body: { password: string }) => Promise.resolve(body) })
    await mutation.execute({ password: 'Segredo2026' })
    expect(mutationCache.getAll()).toHaveLength(1)

    await signInAs(session, DEMO_CREDENTIALS.collector)
    expect(mutationCache.getAll()).toHaveLength(0)

    await mutationCache.build(queryClient, { mutationFn: () => Promise.resolve('x') }).execute(undefined)
    await session.signOut()
    expect(mutationCache.getAll()).toHaveLength(0)
  })

  it('signing in clears the private caches of the previous user (user switch)', async () => {
    const { session, queryClient } = setup()
    await signInAs(session, DEMO_CREDENTIALS.collector)
    seedPrivateCaches(queryClient)
    await signInAs(session, DEMO_CREDENTIALS.creator)
    expectPrivateCleared(queryClient)
    expect(queryClient.getQueryData<SessionInfo>(['session'])?.user.id).toBe('usr_002')
  })
})

describe('session manager: 401 handling', () => {
  it('sends the bearer token on API calls', async () => {
    const { session } = setup()
    const issued = await signInAs(session, DEMO_CREDENTIALS.collector)
    let authorization: string | null = null
    server.use(
      http.get(apiPath('/probe'), ({ request }) => {
        authorization = request.headers.get('authorization')
        return HttpResponse.json({ ok: true })
      }),
    )
    await apiClient.get('/probe')
    expect(authorization).toBe(`Bearer ${issued.token}`)
  })

  it('SESSION_EXPIRED on an authenticated call clears caches + token and asks for the login redirect', async () => {
    const { session, queryClient, events } = setup()
    await signInAs(session, DEMO_CREDENTIALS.collector)
    seedPrivateCaches(queryClient)
    server.use(http.get(apiPath('/probe'), () => errorResponse(401, 'SESSION_EXPIRED', 'Expired.')))

    await expect(apiClient.get('/probe')).rejects.toMatchObject({ code: 'SESSION_EXPIRED' })

    expectPrivateCleared(queryClient)
    expect(queryClient.getQueryData(['session'])).toBeNull()
    expect(session.getToken()).toBeNull()
    expect(window.localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull()
    expect(events).toEqual([{ reason: 'expired', redirectToLogin: true }])
  })

  it('cancels in-flight private queries when the session is lost', async () => {
    const { session, queryClient } = setup()
    await signInAs(session, DEMO_CREDENTIALS.collector)
    let aborted = false
    const pending = queryClient
      .fetchQuery({
        queryKey: ['user', 'usr_001', 'slow'],
        queryFn: ({ signal }) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => {
              aborted = true
              reject(new Error('aborted'))
            })
          }),
      })
      .catch(() => undefined)
    server.use(http.get(apiPath('/probe'), () => errorResponse(401, 'UNAUTHORIZED', 'No.')))
    await expect(apiClient.get('/probe')).rejects.toSatisfy(isApiError)
    await pending
    expect(aborted).toBe(true)
  })

  it('INVALID_CREDENTIALS and other 4xx never end the session', async () => {
    const { session, events } = setup()
    const issued = await signInAs(session, DEMO_CREDENTIALS.collector)
    server.use(
      http.get(apiPath('/probe-credentials'), () => errorResponse(401, 'INVALID_CREDENTIALS', 'Bad.')),
      http.get(apiPath('/probe-forbidden'), () => errorResponse(403, 'FORBIDDEN', 'No.')),
    )
    await expect(apiClient.get('/probe-credentials')).rejects.toSatisfy(isApiError)
    await expect(apiClient.get('/probe-forbidden')).rejects.toSatisfy(isApiError)
    expect(session.getToken()).toBe(issued.token)
    expect(events).toEqual([])
  })

  it('a late 401 for a previous token does not end the current session', async () => {
    const { session, events } = setup()
    await signInAs(session, DEMO_CREDENTIALS.collector)
    server.use(http.get(apiPath('/probe'), () => errorResponse(401, 'SESSION_EXPIRED', 'Expired.')))
    const stale = apiClient.get('/probe', { headers: { Authorization: `Bearer ${'e'.repeat(64)}` } })
    await expect(stale).rejects.toSatisfy(isApiError)
    expect(session.getToken()).not.toBeNull()
    expect(events).toEqual([])
  })

  it('a validated session that expires is reported as expired by the guard path without navigation', async () => {
    const { session, events } = setup()
    await signInAs(session, DEMO_CREDENTIALS.collector)
    await apiClient.post('/__dev/sessions/expire')

    await expect(session.revalidateSession()).resolves.toBeNull()
    expect(events).toEqual([{ reason: 'expired', redirectToLogin: false }])
    expect(session.takeEndReason()).toBe('expired')
    expect(session.takeEndReason()).toBeNull()
  })
})

describe('session manager: logout and cross-tab', () => {
  it('signOut clears locally and revokes the token server side', async () => {
    const { session, queryClient, events } = setup()
    const issued = await signInAs(session, DEMO_CREDENTIALS.collector)
    seedPrivateCaches(queryClient)

    await session.signOut()

    expectPrivateCleared(queryClient)
    expect(queryClient.getQueryData(['session'])).toBeNull()
    expect(window.localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull()
    expect(events).toEqual([{ reason: 'logout', redirectToLogin: false }])
    await expect(authApi.getSession(issued.token)).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })

  it('signOut still logs out locally when the request fails', async () => {
    const { session } = setup()
    await signInAs(session, DEMO_CREDENTIALS.collector)
    server.use(http.post(apiPath('/auth/logout'), () => HttpResponse.error()))
    await expect(session.signOut()).resolves.toBeUndefined()
    expect(session.getToken()).toBeNull()
  })

  it('follows logout and login (other user) from another tab', async () => {
    const { session, queryClient, events } = setup()
    await signInAs(session, DEMO_CREDENTIALS.collector)
    seedPrivateCaches(queryClient)

    // Another tab logs out.
    window.dispatchEvent(
      new StorageEvent('storage', { key: SESSION_STORAGE_KEY, newValue: null, storageArea: window.localStorage }),
    )
    expect(session.getToken()).toBeNull()
    expectPrivateCleared(queryClient)
    expect(events.at(-1)).toEqual({ reason: 'remote-logout', redirectToLogin: false })

    // Another tab signs in as a different user.
    const other = await authApi.login(DEMO_CREDENTIALS.creator)
    const value = JSON.stringify({
      token: other.session.token,
      userId: other.session.user.id,
      expiresAt: other.session.expiresAt,
    })
    window.dispatchEvent(
      new StorageEvent('storage', { key: SESSION_STORAGE_KEY, newValue: value, storageArea: window.localStorage }),
    )
    expect(session.getToken()).toBe(other.session.token)
    expect(events.at(-1)).toEqual({ reason: 'remote-login', redirectToLogin: false })
    await vi.waitFor(() =>
      expect(queryClient.getQueryData<SessionInfo>(['session'])?.user.id).toBe('usr_002'),
    )
  })
})

describe('session manager: guest cart hand-off (P4-01, ADR-006)', () => {
  it('signIn forgets the merged guest cart id and publishes the merge result; logout dismisses it', async () => {
    const { GUEST_CART_STORAGE_KEY, readGuestCartId } = await import('@/features/cart/guest-cart-id')
    const { readCartMergeNotice } = await import('@/features/cart/merge-notice')
    window.localStorage.setItem(GUEST_CART_STORAGE_KEY, '44444444-4444-4444-8444-444444444444')
    const { session } = setup()
    const response = await authApi.login(DEMO_CREDENTIALS.collector)
    const cartMerge = { mergedItems: 1, adjustments: [] }
    session.signIn(response.session, cartMerge)
    expect(readGuestCartId()).toBeNull()
    expect(readCartMergeNotice()).toEqual(cartMerge)
    expect(session.getUserId()).toBe('usr_001')
    await session.signOut()
    expect(readCartMergeNotice()).toBeNull()
    expect(session.getUserId()).toBeNull()
  })

  it('clears non-cart mutations (auth variables) on sign-in but keeps cart mutations', async () => {
    const { session, queryClient } = setup()
    const cache = queryClient.getMutationCache()
    cache.build(queryClient, { mutationKey: ['cart', 'add'], mutationFn: () => Promise.resolve(null) })
    cache.build(queryClient, { mutationFn: () => Promise.resolve(null) })
    await signInAs(session, DEMO_CREDENTIALS.collector)
    expect(cache.getAll().map((mutation) => mutation.options.mutationKey)).toEqual([['cart', 'add']])
  })
})
