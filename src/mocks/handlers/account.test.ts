import { describe, expect, it } from 'vitest'
import { createApiClient } from '@/api/client'
import { isApiError, type ApiError } from '@/api/errors'
import {
  AVATAR_MAX_DATA_URL_LENGTH,
  authResponseSchema,
  favoriteListSchema,
  favoriteStatusSchema,
  profileSchema,
  walletSchema,
  walletsResponseSchema,
} from '@/contracts'
import { DEMO_CREDENTIALS } from '../fixtures/users'

/**
 * P3-02 account mock (docs/API_CONTRACTS.md Favorites / Profile / Wallets):
 * status codes, field errors, salted password change and user isolation.
 */
const client = createApiClient({ baseURL: '/api', timeoutMs: 5000 })
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

async function capture(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise
  } catch (error) {
    if (isApiError(error)) return error
    throw error
  }
  throw new Error('Expected request to fail')
}

async function login(credentials: { email: string; password: string }) {
  const { data } = await client.post<unknown>('/auth/login', credentials, { skipAuth: true })
  const token = authResponseSchema.parse(data).session.token
  return { skipAuth: true, headers: { Authorization: `Bearer ${token}` } }
}

const collector = () => login(DEMO_CREDENTIALS.collector)
const creator = () => login(DEMO_CREDENTIALS.creator)

const PROFILE = {
  displayName: 'Colecionador Novo',
  username: 'colecionador.novo',
  email: 'novo@kurio.test',
  ensName: 'colecionador.eth',
  walletNickname: 'Cofre',
}

describe('favorites mock', () => {
  it('requires a session', async () => {
    expect((await capture(client.get('/favorites', { skipAuth: true }))).status).toBe(401)
    expect((await capture(client.put('/favorites/nft_001', undefined, { skipAuth: true }))).status).toBe(401)
  })

  it('PUT/DELETE are idempotent, list is newest first, unknown NFT is 404', async () => {
    const auth = await collector()
    for (const id of ['nft_001', 'nft_002', 'nft_002']) {
      const { data } = await client.put<unknown>(`/favorites/${id}`, undefined, auth)
      expect(favoriteStatusSchema.parse(data)).toEqual({ nftId: id, favorited: true })
    }
    const list = favoriteListSchema.parse((await client.get<unknown>('/favorites', auth)).data)
    expect(list.items.map((item) => item.nftId)).toEqual(['nft_002', 'nft_001'])
    expect(list.items[0]?.nft.id).toBe('nft_002')

    for (let i = 0; i < 2; i += 1) {
      const { data } = await client.delete<unknown>('/favorites/nft_002', auth)
      expect(favoriteStatusSchema.parse(data)).toEqual({ nftId: 'nft_002', favorited: false })
    }
    const after = favoriteListSchema.parse((await client.get<unknown>('/favorites', auth)).data)
    expect(after.items.map((item) => item.nftId)).toEqual(['nft_001'])

    const missing = await capture(client.put('/favorites/nft_999', undefined, auth))
    expect([missing.status, missing.code]).toEqual([404, 'NFT_NOT_FOUND'])
  })

  it('isolates users', async () => {
    const a = await collector()
    const b = await creator()
    await client.put('/favorites/nft_003', undefined, a)
    const list = favoriteListSchema.parse((await client.get<unknown>('/favorites', b)).data)
    expect(list.items).toEqual([])
    await client.delete('/favorites/nft_003', b)
    const own = favoriteListSchema.parse((await client.get<unknown>('/favorites', a)).data)
    expect(own.items.map((item) => item.nftId)).toEqual(['nft_003'])
  })
})

describe('profile mock', () => {
  it('returns registration defaults and updates the session user', async () => {
    const auth = await collector()
    const initial = profileSchema.parse((await client.get<unknown>('/profile', auth)).data)
    expect(initial).toMatchObject({ userId: 'usr_001', ensName: null, walletNickname: null, avatarUrl: null })

    const updated = profileSchema.parse((await client.put<unknown>('/profile', PROFILE, auth)).data)
    expect(updated).toMatchObject({ ...PROFILE, userId: 'usr_001' })
    const session = (await client.get<{ user: { displayName: string; email: string } }>('/auth/session', auth)).data
    expect(session.user).toMatchObject({ displayName: PROFILE.displayName, email: PROFILE.email })
  })

  it('rejects taken email/username (409) and invalid fields (422)', async () => {
    const auth = await collector()
    const email = await capture(client.put('/profile', { ...PROFILE, email: DEMO_CREDENTIALS.creator.email }, auth))
    expect([email.status, email.code]).toEqual([409, 'EMAIL_TAKEN'])
    const username = await capture(client.put('/profile', { ...PROFILE, username: 'nova.sato' }, auth))
    expect([username.status, username.code]).toEqual([409, 'USERNAME_TAKEN'])
    const invalid = await capture(client.put('/profile', { ...PROFILE, walletNickname: '' }, auth))
    expect([invalid.status, invalid.code]).toEqual([422, 'VALIDATION_ERROR'])
    expect(invalid.details).toMatchObject({ fieldErrors: { walletNickname: expect.any(Array) } })
  })

  it('validates avatar type and size, and removes it', async () => {
    const auth = await collector()
    const saved = profileSchema.parse((await client.put<unknown>('/profile/avatar', { dataUrl: PNG }, auth)).data)
    expect(saved.avatarUrl).toBe(PNG)

    const gif = await capture(client.put('/profile/avatar', { dataUrl: 'data:image/gif;base64,R0lGOD==' }, auth))
    expect([gif.status, gif.code]).toEqual([422, 'VALIDATION_ERROR'])
    const huge = `data:image/png;base64,${'A'.repeat(AVATAR_MAX_DATA_URL_LENGTH)}`
    expect((await capture(client.put('/profile/avatar', { dataUrl: huge }, auth))).status).toBe(422)

    const removed = profileSchema.parse((await client.delete<unknown>('/profile/avatar', auth)).data)
    expect(removed.avatarUrl).toBeNull()
  })

  it('changes the password only with the right current password', async () => {
    const auth = await collector()
    const wrong = await capture(
      client.post('/profile/password', { currentPassword: 'Errada2026', newPassword: 'NovaSenha2027' }, auth),
    )
    expect([wrong.status, wrong.code]).toEqual([422, 'CURRENT_PASSWORD_INVALID'])
    expect(wrong.details).toMatchObject({ fieldErrors: { currentPassword: expect.any(Array) } })

    const weak = await capture(
      client.post('/profile/password', { currentPassword: DEMO_CREDENTIALS.collector.password, newPassword: 'short' }, auth),
    )
    expect([weak.status, weak.code]).toEqual([422, 'VALIDATION_ERROR'])

    const ok = await client.post('/profile/password', { currentPassword: DEMO_CREDENTIALS.collector.password, newPassword: 'NovaSenha2027' }, auth)
    expect(ok.status).toBe(204)

    const old = await capture(login(DEMO_CREDENTIALS.collector))
    expect(old.code).toBe('INVALID_CREDENTIALS')
    await expect(login({ email: DEMO_CREDENTIALS.collector.email, password: 'NovaSenha2027' })).resolves.toBeDefined()
  })

  it('isolates users', async () => {
    const a = await collector()
    const b = await creator()
    await client.put('/profile', PROFILE, a)
    await client.put('/profile/avatar', { dataUrl: PNG }, a)
    const other = profileSchema.parse((await client.get<unknown>('/profile', b)).data)
    expect(other).toMatchObject({ userId: 'usr_002', displayName: 'Nova Sato', walletNickname: null, avatarUrl: null })
  })
})

describe('wallets mock (management endpoints)', () => {
  const WALLET = {
    label: 'Principal',
    displayName: 'Nova Sato',
    profileName: 'Nova Sato',
    email: 'nova@kurio.test',
    network: 'ethereum',
    provider: 'metamask',
    address: '0x52908400098527886E0F7030069857D2E4169EE7',
    alternateAddress: null,
    ensName: 'nova.eth',
    referralCode: 'KURIO2026',
  }

  it('validates the address against the network and requires the primary first', async () => {
    const auth = await creator()
    const secondary = await capture(client.put('/wallets/secondary', WALLET, auth))
    expect([secondary.status, secondary.code]).toEqual([409, 'PRIMARY_WALLET_REQUIRED'])

    const mismatch = await capture(client.put('/wallets/primary', { ...WALLET, network: 'solana' }, auth))
    expect([mismatch.status, mismatch.code]).toEqual([422, 'VALIDATION_ERROR'])
    expect(mismatch.details).toMatchObject({ fieldErrors: { address: expect.any(Array) } })

    const created = await client.put<unknown>('/wallets/primary', WALLET, auth)
    expect(created.status).toBe(201)
    expect(walletSchema.parse(created.data).connection).toBeNull()
    const edited = await client.put<unknown>('/wallets/primary', { ...WALLET, label: 'Cofre' }, auth)
    expect(edited.status).toBe(200)
  })

  it('connects and disconnects (idempotent) and isolates users', async () => {
    const b = await creator()
    await client.put('/wallets/primary', WALLET, b)
    await client.post('/wallets/primary/connection', { network: 'ethereum' }, b)
    let wallets = walletsResponseSchema.parse((await client.get<unknown>('/wallets', b)).data)
    expect(wallets.primary?.connection?.status).toBe('connected')

    for (let i = 0; i < 2; i += 1) expect((await client.delete('/wallets/primary/connection', b)).status).toBe(204)
    wallets = walletsResponseSchema.parse((await client.get<unknown>('/wallets', b)).data)
    expect(wallets.primary?.connection).toBeNull()

    const a = await collector()
    const own = walletsResponseSchema.parse((await client.get<unknown>('/wallets', a)).data)
    expect(own.primary?.id).toBe('wal_usr_001_primary')
    expect(own.primary?.address).not.toBe(WALLET.address)
  })
})
