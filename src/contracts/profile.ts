import { z } from 'zod'
import {
  displayNameSchema,
  emailSchema,
  ensNameSchema,
  idSchema,
  isoDateTimeSchema,
  passwordSchema,
  usernameSchema,
} from './common/primitives'

/**
 * Collector profile (README §3 "Perfil do colecionador"; §5 "Perfil"). Fields
 * follow the Figma form. Auth required. A successful update also changes the
 * `user` part of the session (client refetches/patches the session query).
 */
const walletNicknameSchema = z.string().trim().min(2).max(40)

/**
 * Defaults at registration (the "Cadastro" form only collects username, email
 * and password): `displayName = username`, `walletNickname = null`,
 * `ensName = null`, `avatarUrl = null`.
 */
export const profileSchema = z.object({
  userId: idSchema,
  displayName: displayNameSchema,
  username: usernameSchema,
  email: emailSchema,
  ensName: ensNameSchema.nullable(),
  /**
   * "Apelido da carteira". Null right after registration (not collected by
   * the "Cadastro" form); required when the profile form is saved.
   */
  walletNickname: walletNicknameSchema.nullable(),
  avatarUrl: z.string().min(1).nullable(),
  updatedAt: isoDateTimeSchema,
})
export type Profile = z.infer<typeof profileSchema>

/**
 * `PUT /api/profile` (full replace of editable fields; doubles as the form
 * schema). 409 EMAIL_TAKEN / USERNAME_TAKEN. `walletNickname` is required here
 * even though stored profiles may still have it null.
 */
export const updateProfileRequestSchema = z.object({
  displayName: displayNameSchema,
  username: usernameSchema,
  email: emailSchema,
  ensName: ensNameSchema.nullable(),
  walletNickname: walletNicknameSchema,
})
export type UpdateProfileRequest = z.infer<typeof updateProfileRequestSchema>

export const AVATAR_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const
/** Max encoded data URL length (~512 KiB of image data). */
export const AVATAR_MAX_DATA_URL_LENGTH = 700_000

/** `PUT /api/profile/avatar` → Profile. `DELETE /api/profile/avatar` → Profile. */
export const updateAvatarRequestSchema = z.object({
  dataUrl: z
    .string()
    .max(AVATAR_MAX_DATA_URL_LENGTH, 'Image is too large')
    .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/, 'Use a PNG, JPEG or WebP image'),
})
export type UpdateAvatarRequest = z.infer<typeof updateAvatarRequestSchema>

/** `POST /api/profile/password` → 204. 422 CURRENT_PASSWORD_INVALID. */
export const changePasswordRequestSchema = z
  .object({ currentPassword: z.string().min(1).max(72), newPassword: passwordSchema })
  .refine((v) => v.currentPassword !== v.newPassword, {
    path: ['newPassword'],
    message: 'New password must differ from the current one',
  })
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>

/** Client-side form (Figma "Alterar senha"): adds confirmation, never sent. */
export const changePasswordFormSchema = z
  .object({
    currentPassword: z.string().min(1).max(72),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    path: ['newPassword'],
    message: 'New password must differ from the current one',
  })
export type ChangePasswordForm = z.infer<typeof changePasswordFormSchema>
