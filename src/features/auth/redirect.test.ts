import { describe, expect, it } from 'vitest'
import { loginSearch, sanitizeRedirect, validateAuthSearch } from './redirect'

describe('sanitizeRedirect', () => {
  it.each([
    ['/perfil', '/perfil'],
    ['/nft/emerald-ape-042?x=1#top', '/nft/emerald-ape-042?x=1#top'],
    ['/?q=ape&categories=music,gaming', '/?q=ape&categories=music,gaming'],
    ['/', '/'],
  ])('keeps the same-origin path %s', (input, expected) => {
    expect(sanitizeRedirect(input)).toBe(expected)
  })

  it.each([
    '//evil.com',
    '//evil.com/perfil',
    '/\\evil.com',
    '\\\\evil.com',
    'https://evil.com',
    'http:/evil.com',
    'javascript:alert(1)',
    'perfil',
    '',
    ' /perfil',
    '/\t/evil.com',
    '/\n/evil.com',
    `/${'a'.repeat(3000)}`,
    '/login',
    '/login?redirect=/perfil',
    '/cadastro/',
    // Dot segments that normalize into a protocol-relative URL or an auth page.
    '/.//evil.com',
    '/..//evil.com',
    '/a/..//evil.com',
    '/%2e//evil.com',
    '/%2e%2e/login',
    '/a/../login',
    undefined,
    null,
    42,
    ['/perfil'],
  ])('falls back to / for %j', (input) => {
    expect(sanitizeRedirect(input)).toBe('/')
  })
})

describe('validateAuthSearch', () => {
  it('normalizes redirect and reason, omitting defaults', () => {
    expect(validateAuthSearch({ redirect: '/perfil', reason: 'expired' })).toEqual({
      redirect: '/perfil',
      reason: 'expired',
    })
    expect(validateAuthSearch({ redirect: '//evil.com', reason: 'other' })).toEqual({})
    expect(validateAuthSearch({})).toEqual({})
  })

  it('uses the last value of repeated keys', () => {
    expect(validateAuthSearch({ redirect: ['//evil.com', '/perfil'] })).toEqual({ redirect: '/perfil' })
    expect(validateAuthSearch({ redirect: ['/perfil', '//evil.com'] })).toEqual({})
  })
})

describe('loginSearch', () => {
  it('builds the search for a login link back to the current page', () => {
    expect(loginSearch('/')).toEqual({})
    expect(loginSearch('/perfil')).toEqual({ redirect: '/perfil' })
    expect(loginSearch('/perfil', 'expired')).toEqual({ redirect: '/perfil', reason: 'expired' })
    expect(loginSearch('/login?redirect=/perfil')).toEqual({})
  })
})
