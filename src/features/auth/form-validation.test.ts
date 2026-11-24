import { describe, expect, it } from 'vitest'
import { ApiError } from '@/api/errors'
import { mapAuthError, validateLogin, validateRegister } from './form-validation'

const VALID_REGISTER = {
  username: 'Nova.Colecionadora',
  email: ' Nova@Kurio.Test ',
  password: 'Segredo2026',
  confirmPassword: 'Segredo2026',
}

const USERNAME_RULE = 'Use de 3 a 24 caracteres: letras minúsculas, números, "_" ou ".".'

describe('validateLogin', () => {
  it('requires both fields with pt-BR messages', () => {
    expect(validateLogin({ email: '', password: '' })).toEqual({
      ok: false,
      errors: { email: 'Informe seu e-mail.', password: 'Informe sua senha.' },
    })
  })

  it('rejects an invalid e-mail', () => {
    expect(validateLogin({ email: 'nope', password: 'x' })).toEqual({
      ok: false,
      errors: { email: 'Informe um e-mail válido.' },
    })
  })

  it('returns the normalized request (contract schema) when valid', () => {
    expect(validateLogin({ email: ' Colecionador@Kurio.test ', password: ' segredo ' })).toEqual({
      ok: true,
      data: { email: 'colecionador@kurio.test', password: ' segredo ' },
    })
  })
})

describe('validateRegister', () => {
  it('returns the request without the confirmation', () => {
    expect(validateRegister(VALID_REGISTER)).toEqual({
      ok: true,
      data: { username: 'nova.colecionadora', email: 'nova@kurio.test', password: 'Segredo2026' },
    })
  })

  it('requires every field', () => {
    expect(validateRegister({ username: ' ', email: '', password: '', confirmPassword: '' })).toEqual({
      ok: false,
      errors: {
        username: 'Informe um nome de usuário.',
        email: 'Informe seu e-mail.',
        password: 'Informe sua senha.',
        confirmPassword: 'Confirme sua senha.',
      },
    })
  })

  it.each([
    [{ username: 'ab' }, 'username', USERNAME_RULE],
    [{ username: 'nome com espaço' }, 'username', USERNAME_RULE],
    [{ password: 'abc1', confirmPassword: 'abc1' }, 'password', 'A senha deve ter pelo menos 8 caracteres.'],
    [{ password: 'somenteletras', confirmPassword: 'somenteletras' }, 'password', 'A senha deve conter ao menos um número.'],
    [{ password: '1234567890', confirmPassword: '1234567890' }, 'password', 'A senha deve conter ao menos uma letra.'],
    [{ confirmPassword: 'Outra2026' }, 'confirmPassword', 'As senhas não coincidem.'],
  ] as const)('reports %j on %s', (patch, field, message) => {
    const result = validateRegister({ ...VALID_REGISTER, ...patch })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors[field]).toBe(message)
  })

  it('reports a mismatch even when other fields are invalid', () => {
    const result = validateRegister({ username: '', email: 'x', password: 'Segredo2026', confirmPassword: 'Outra' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.confirmPassword).toBe('As senhas não coincidem.')
  })
})

describe('mapAuthError', () => {
  const FIELDS = ['username', 'email', 'password', 'confirmPassword'] as const

  it('keeps INVALID_CREDENTIALS a form error', () => {
    const error = new ApiError({ kind: 'unauthorized', status: 401, code: 'INVALID_CREDENTIALS' })
    expect(mapAuthError(error, ['email', 'password'] as const)).toEqual({
      fieldErrors: {},
      formError: 'E-mail ou senha incorretos.',
    })
  })

  it('maps EMAIL_TAKEN / USERNAME_TAKEN to their fields', () => {
    const email = new ApiError({
      kind: 'conflict',
      status: 409,
      code: 'EMAIL_TAKEN',
      details: { fieldErrors: { email: ['taken'], username: ['taken'] } },
    })
    expect(mapAuthError(email, FIELDS)).toEqual({
      fieldErrors: { email: 'Este e-mail já está cadastrado.', username: 'Este nome de usuário já está em uso.' },
      formError: null,
    })
    const username = new ApiError({ kind: 'conflict', status: 409, code: 'USERNAME_TAKEN' })
    expect(mapAuthError(username, FIELDS)).toEqual({
      fieldErrors: { username: 'Este nome de usuário já está em uso.' },
      formError: null,
    })
  })

  it('maps server VALIDATION_ERROR field errors by path', () => {
    const error = new ApiError({
      kind: 'validation',
      status: 422,
      code: 'VALIDATION_ERROR',
      details: { fieldErrors: { password: ['Too short'], unknown: ['x'] } },
    })
    expect(mapAuthError(error, FIELDS)).toEqual({
      fieldErrors: { password: 'Verifique este campo.' },
      formError: 'Revise os dados informados.',
    })
  })

  it('maps transport failures to form messages', () => {
    expect(mapAuthError(new ApiError({ kind: 'network' }), FIELDS).formError).toMatch(/Sem conexão/)
    expect(mapAuthError(new ApiError({ kind: 'timeout' }), FIELDS).formError).toMatch(/demorou/)
    const transient = new ApiError({ kind: 'transient', status: 500, code: 'INTERNAL_ERROR' })
    expect(mapAuthError(transient, FIELDS).formError).toMatch(/indisponível/)
    expect(mapAuthError(new Error('boom'), FIELDS).formError).toMatch(/Não foi possível/)
  })
})
