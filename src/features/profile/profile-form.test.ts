import { describe, expect, it } from 'vitest'
import { AVATAR_MAX_DATA_URL_LENGTH } from '@/contracts'
import { validateWallet, walletFormValues, EMPTY_WALLET_FORM } from '@/features/wallets/wallet-form'
import {
  AVATAR_MESSAGES,
  avatarDataUrlError,
  avatarFileError,
  PASSWORD_MESSAGES,
  validatePassword,
  validateProfile,
} from './profile-form'

const VALUES = { displayName: 'Kurio', username: 'kurio.collector', email: 'a@kurio.test', ens: '', walletNickname: 'Cofre' }

describe('profile form', () => {
  it('requires walletNickname, ENS optional (null) or name.eth', () => {
    expect(validateProfile(VALUES)).toMatchObject({ ok: true, data: { ensName: null } })
    expect(validateProfile({ ...VALUES, ens: 'kurio' })).toMatchObject({ ok: true, data: { ensName: 'kurio.eth' } })
    expect(validateProfile({ ...VALUES, walletNickname: '' })).toMatchObject({ ok: false, errors: { walletNickname: expect.any(String) } })
    expect(validateProfile({ ...VALUES, ens: 'x' })).toMatchObject({ ok: false, errors: { ens: expect.any(String) } })
  })

  it('validates password change (current, policy, confirmation, different)', () => {
    expect(validatePassword({ currentPassword: '', newPassword: 'Nova2027a', confirmPassword: 'Nova2027a' })).toMatchObject({
      ok: false,
      errors: { currentPassword: PASSWORD_MESSAGES.required },
    })
    expect(validatePassword({ currentPassword: 'Velha2026', newPassword: 'curta', confirmPassword: 'curta' })).toMatchObject({
      errors: { newPassword: PASSWORD_MESSAGES.policy },
    })
    expect(validatePassword({ currentPassword: 'Velha2026', newPassword: 'Velha2026', confirmPassword: 'Velha2026' })).toMatchObject({
      errors: { newPassword: PASSWORD_MESSAGES.same },
    })
    expect(validatePassword({ currentPassword: 'Velha2026', newPassword: 'Nova2027a', confirmPassword: 'Nova2027b' })).toMatchObject({
      errors: { confirmPassword: PASSWORD_MESSAGES.mismatch },
    })
    expect(validatePassword({ currentPassword: 'Velha2026', newPassword: 'Nova2027a', confirmPassword: 'Nova2027a' })).toEqual({
      ok: true,
      data: { currentPassword: 'Velha2026', newPassword: 'Nova2027a' },
    })
  })

  it('validates avatar type and size', () => {
    expect(avatarFileError({ type: 'image/gif', size: 10 })).toBe(AVATAR_MESSAGES.type)
    expect(avatarFileError({ type: 'image/png', size: AVATAR_MAX_DATA_URL_LENGTH })).toBe(AVATAR_MESSAGES.size)
    expect(avatarFileError({ type: 'image/webp', size: 1000 })).toBeNull()
    expect(avatarDataUrlError(`data:image/png;base64,${'A'.repeat(AVATAR_MAX_DATA_URL_LENGTH)}`)).toBe(AVATAR_MESSAGES.size)
    expect(avatarDataUrlError('data:image/svg+xml;base64,AAAA')).toBe(AVATAR_MESSAGES.type)
  })
})

describe('wallet form', () => {
  const VALID = {
    ...EMPTY_WALLET_FORM,
    displayName: 'Kurio',
    label: 'Cofre',
    network: 'ethereum' as const,
    profileName: 'Kurio',
    address: '0x52908400098527886E0F7030069857D2E4169EE7',
    provider: 'metamask' as const,
    referralCode: 'KURIO2026',
    email: 'a@kurio.test',
    ens: 'kurio',
  }

  it('requires the address to match the network', () => {
    const ok = validateWallet(VALID)
    expect(ok).toMatchObject({ ok: true, data: { ensName: 'kurio.eth', alternateAddress: null } })
    expect(validateWallet({ ...VALID, network: 'solana' })).toMatchObject({ ok: false, errors: { address: expect.any(String) } })
    expect(validateWallet({ ...VALID, network: '' })).toMatchObject({ ok: false, errors: { network: expect.any(String) } })
    if (ok.ok) expect(walletFormValues(ok.data)).toEqual(VALID)
  })
})
