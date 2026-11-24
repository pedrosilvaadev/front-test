import type { z } from 'zod'
import { isApiError } from '@/api/errors'
import {
  fieldErrorsDetailsSchema,
  loginRequestSchema,
  registerFormSchema,
  type LoginRequest,
  type RegisterRequest,
} from '@/contracts'

/**
 * Client-side validation for the auth forms with the contract schemas
 * (ADR-002: `loginRequestSchema`, `registerFormSchema`), translated to pt-BR
 * per field, plus mapping of server errors (field errors and codes) to the
 * same fields. The first message per field is shown.
 */

export type LoginField = 'email' | 'password'
export type RegisterField = 'username' | 'email' | 'password' | 'confirmPassword'
export type FieldErrors<F extends string> = Partial<Record<F, string>>

export type LoginValues = Record<LoginField, string>
export type RegisterValues = Record<RegisterField, string>

export type ValidationResult<F extends string, T> = { ok: true; data: T } | { ok: false; errors: FieldErrors<F> }

const REQUIRED: Record<RegisterField, string> = {
  username: 'Informe um nome de usuário.',
  email: 'Informe seu e-mail.',
  password: 'Informe sua senha.',
  confirmPassword: 'Confirme sua senha.',
}

const MESSAGES = {
  email: 'Informe um e-mail válido.',
  emailTooLong: 'O e-mail deve ter no máximo 254 caracteres.',
  username: 'Use de 3 a 24 caracteres: letras minúsculas, números, "_" ou ".".',
  passwordTooShort: 'A senha deve ter pelo menos 8 caracteres.',
  passwordTooLong: 'A senha deve ter no máximo 72 caracteres.',
  passwordLetter: 'A senha deve conter ao menos uma letra.',
  passwordDigit: 'A senha deve conter ao menos um número.',
  confirmMismatch: 'As senhas não coincidem.',
} as const

function issueMessage(field: RegisterField, issue: z.core.$ZodIssue): string {
  switch (field) {
    case 'email':
      return issue.code === 'too_big' ? MESSAGES.emailTooLong : MESSAGES.email
    case 'username':
      return MESSAGES.username
    case 'password':
      if (issue.code === 'too_small') return MESSAGES.passwordTooShort
      if (issue.code === 'too_big') return MESSAGES.passwordTooLong
      if (issue.code === 'invalid_format' && 'pattern' in issue && typeof issue.pattern === 'string') {
        return issue.pattern.includes('A-Za-z') ? MESSAGES.passwordLetter : MESSAGES.passwordDigit
      }
      return MESSAGES.passwordTooShort
    case 'confirmPassword':
      return MESSAGES.confirmMismatch
  }
}

function collect<F extends RegisterField>(
  fields: readonly F[],
  values: Record<F, string>,
  issues: readonly z.core.$ZodIssue[],
): FieldErrors<F> {
  const errors: FieldErrors<F> = {}
  for (const field of fields) {
    // Required check on the raw value (the schemas trim; an empty field reads better as "required").
    // Passwords are never trimmed, so only a truly empty one is "missing".
    const isPassword = field === 'password' || field === 'confirmPassword'
    if (isPassword ? values[field] === '' : values[field].trim() === '') {
      errors[field] = REQUIRED[field]
    }
  }
  for (const issue of issues) {
    const field = issue.path[0]
    if (typeof field !== 'string' || !(fields as readonly string[]).includes(field)) continue
    const key = field as F
    errors[key] ??= issueMessage(key, issue)
  }
  return errors
}

export function validateLogin(values: LoginValues): ValidationResult<LoginField, LoginRequest> {
  const result = loginRequestSchema.safeParse({ email: values.email, password: values.password })
  const errors = collect(['email', 'password'] as const, values, result.success ? [] : result.error.issues)
  if (result.success && Object.keys(errors).length === 0) return { ok: true, data: result.data }
  return { ok: false, errors }
}

export function validateRegister(values: RegisterValues): ValidationResult<RegisterField, RegisterRequest> {
  const result = registerFormSchema.safeParse(values)
  const errors = collect(
    ['username', 'email', 'password', 'confirmPassword'] as const,
    values,
    result.success ? [] : result.error.issues,
  )
  // Mismatch is also reported when other fields are invalid (object refinements may be skipped).
  if (!errors.confirmPassword && values.confirmPassword !== values.password) {
    errors.confirmPassword = MESSAGES.confirmMismatch
  }
  if (result.success && Object.keys(errors).length === 0) {
    const { username, email, password } = result.data
    return { ok: true, data: { username, email, password } }
  }
  return { ok: false, errors }
}

export interface MappedServerError<F extends string> {
  fieldErrors: FieldErrors<F>
  /** Message for the form-level alert, if any. */
  formError: string | null
}

const TAKEN: Partial<Record<RegisterField, string>> = {
  email: 'Este e-mail já está cadastrado.',
  username: 'Este nome de usuário já está em uso.',
}

/** Maps an auth API failure to field errors and/or a form message (pt-BR, by `code`). */
export function mapAuthError<F extends RegisterField>(error: unknown, fields: readonly F[]): MappedServerError<F> {
  if (!isApiError(error)) return { fieldErrors: {}, formError: 'Não foi possível concluir. Tente novamente.' }

  const details = fieldErrorsDetailsSchema.safeParse(error.details)
  const detailFields = details.success
    ? fields.filter((field) => (details.data.fieldErrors[field]?.length ?? 0) > 0)
    : []

  switch (error.code) {
    case 'INVALID_CREDENTIALS':
      return { fieldErrors: {}, formError: 'E-mail ou senha incorretos.' }
    case 'EMAIL_TAKEN':
    case 'USERNAME_TAKEN': {
      const fieldErrors: FieldErrors<F> = {}
      const taken = detailFields.length > 0 ? detailFields : fields.filter((f) => f === (error.code === 'EMAIL_TAKEN' ? 'email' : 'username'))
      for (const field of taken) fieldErrors[field] = TAKEN[field] ?? 'Verifique este campo.'
      return { fieldErrors, formError: null }
    }
    case 'VALIDATION_ERROR': {
      const fieldErrors: FieldErrors<F> = {}
      for (const field of detailFields) fieldErrors[field] = 'Verifique este campo.'
      return { fieldErrors, formError: 'Revise os dados informados.' }
    }
  }
  switch (error.kind) {
    case 'network':
      return { fieldErrors: {}, formError: 'Sem conexão com o servidor. Verifique sua internet e tente novamente.' }
    case 'timeout':
      return { fieldErrors: {}, formError: 'O servidor demorou demais para responder. Tente novamente.' }
    case 'transient':
      return { fieldErrors: {}, formError: 'O serviço está temporariamente indisponível. Tente novamente.' }
    default:
      return { fieldErrors: {}, formError: 'Não foi possível concluir. Tente novamente.' }
  }
}
