import {
  AVATAR_MAX_DATA_URL_LENGTH,
  AVATAR_MIME_TYPES,
  changePasswordRequestSchema,
  updateProfileRequestSchema,
  type ChangePasswordRequest,
  type Profile,
  type UpdateProfileRequest,
} from '@/contracts'
import { apiErrorCode, apiFieldErrorKeys } from './account-errors'

/** Figma "Perfil do colecionador" form model; `ens` is the name without `.eth`. */
export interface ProfileValues {
  displayName: string
  username: string
  email: string
  ens: string
  walletNickname: string
}
export type ProfileField = keyof ProfileValues

export interface PasswordValues {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}
export type PasswordField = keyof PasswordValues

export type Errors<F extends string> = Partial<Record<F, string>>

export const PROFILE_MESSAGES: Record<ProfileField, string> = {
  displayName: 'Informe o nome de exibição (2 a 50 caracteres).',
  username: 'Use de 3 a 24 letras, números, "_" ou ".".',
  email: 'Informe um e-mail válido.',
  ens: 'Use de 3 a 63 letras minúsculas, números ou "-".',
  walletNickname: 'Informe o apelido da carteira (2 a 40 caracteres).',
}

const PROFILE_FIELD_OF: Record<string, ProfileField> = {
  displayName: 'displayName',
  username: 'username',
  email: 'email',
  ensName: 'ens',
  walletNickname: 'walletNickname',
}

export const PROFILE_FIELD_ORDER: readonly ProfileField[] = ['displayName', 'username', 'email', 'ens', 'walletNickname']

const stripEth = (value: string) => value.replace(/\.eth$/i, '')

export function profileValues(profile: Profile): ProfileValues {
  return {
    displayName: profile.displayName,
    username: profile.username,
    email: profile.email,
    ens: profile.ensName ? stripEth(profile.ensName) : '',
    walletNickname: profile.walletNickname ?? '',
  }
}

/**
 * Validates with the contract schema. ENS is optional (`ensName | null` in
 * `UpdateProfileRequest`); `walletNickname` is required on save.
 */
export function validateProfile(
  values: ProfileValues,
): { ok: true; data: UpdateProfileRequest } | { ok: false; errors: Errors<ProfileField> } {
  const ens = values.ens.trim()
  const parsed = updateProfileRequestSchema.safeParse({
    displayName: values.displayName,
    username: values.username,
    email: values.email,
    ensName: ens === '' ? null : `${stripEth(ens)}.eth`,
    walletNickname: values.walletNickname,
  })
  if (parsed.success) return { ok: true, data: parsed.data }
  const errors: Errors<ProfileField> = {}
  for (const issue of parsed.error.issues) {
    const field = PROFILE_FIELD_OF[String(issue.path[0])]
    if (field && !errors[field]) errors[field] = PROFILE_MESSAGES[field]
  }
  return { ok: false, errors }
}

export const PASSWORD_MESSAGES = {
  required: 'Informe a senha atual.',
  policy: 'Use de 8 a 72 caracteres, com letras e números.',
  same: 'A nova senha deve ser diferente da atual.',
  mismatch: 'As senhas não coincidem.',
  invalidCurrent: 'Senha atual incorreta.',
} as const

export function hasPasswordInput(values: PasswordValues): boolean {
  return values.currentPassword !== '' || values.newPassword !== '' || values.confirmPassword !== ''
}

export function validatePassword(
  values: PasswordValues,
): { ok: true; data: ChangePasswordRequest } | { ok: false; errors: Errors<PasswordField> } {
  const errors: Errors<PasswordField> = {}
  if (values.currentPassword === '') errors.currentPassword = PASSWORD_MESSAGES.required
  const parsed = changePasswordRequestSchema.safeParse({
    currentPassword: values.currentPassword,
    newPassword: values.newPassword,
  })
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      if (issue.path[0] !== 'newPassword' || errors.newPassword) continue
      errors.newPassword =
        values.newPassword !== '' && values.newPassword === values.currentPassword
          ? PASSWORD_MESSAGES.same
          : PASSWORD_MESSAGES.policy
    }
  }
  if (values.confirmPassword !== values.newPassword) errors.confirmPassword = PASSWORD_MESSAGES.mismatch
  if (parsed.success && Object.keys(errors).length === 0) return { ok: true, data: parsed.data }
  return { ok: false, errors }
}

/** Maps a `PUT /api/profile` failure to field errors (409 taken / 422 fields). */
export function profileServerErrors(error: unknown): Errors<ProfileField> | null {
  const code = apiErrorCode(error)
  if (code === 'EMAIL_TAKEN') return { email: 'Este e-mail já está em uso.' }
  if (code === 'USERNAME_TAKEN') return { username: 'Este nome de usuário já está em uso.' }
  if (code === 'VALIDATION_ERROR') {
    const errors: Errors<ProfileField> = {}
    for (const key of apiFieldErrorKeys(error)) {
      const field = PROFILE_FIELD_OF[key]
      if (field) errors[field] = PROFILE_MESSAGES[field]
    }
    return Object.keys(errors).length > 0 ? errors : null
  }
  return null
}

export function passwordServerErrors(error: unknown): Errors<PasswordField> | null {
  const code = apiErrorCode(error)
  if (code === 'CURRENT_PASSWORD_INVALID') return { currentPassword: PASSWORD_MESSAGES.invalidCurrent }
  if (code === 'VALIDATION_ERROR') {
    const keys = apiFieldErrorKeys(error)
    if (keys.includes('newPassword')) return { newPassword: PASSWORD_MESSAGES.policy }
    if (keys.includes('currentPassword')) return { currentPassword: PASSWORD_MESSAGES.required }
  }
  return null
}

export const AVATAR_MESSAGES = {
  type: 'Use uma imagem PNG, JPEG ou WebP.',
  size: 'A imagem é muito grande (máximo de ~500 KB).',
  read: 'Não foi possível ler a imagem.',
} as const

/** Client-side check before reading the file (the server re-validates). */
export function avatarFileError(file: Pick<File, 'type' | 'size'>): string | null {
  if (!(AVATAR_MIME_TYPES as readonly string[]).includes(file.type)) return AVATAR_MESSAGES.type
  // base64 grows by 4/3: reject early files that can never fit.
  if (Math.ceil(file.size / 3) * 4 > AVATAR_MAX_DATA_URL_LENGTH) return AVATAR_MESSAGES.size
  return null
}

export function avatarDataUrlError(dataUrl: string): string | null {
  if (dataUrl.length > AVATAR_MAX_DATA_URL_LENGTH) return AVATAR_MESSAGES.size
  if (!/^data:image\/(png|jpeg|webp);base64,/.test(dataUrl)) return AVATAR_MESSAGES.type
  return null
}

export function readFileAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('read'))
    }
    reader.onerror = () => reject(reader.error ?? new Error('read'))
    reader.readAsDataURL(file)
  })
}
