import { z } from 'zod'
import { cartMergeResultSchema } from './cart'
import {
  displayNameSchema,
  emailSchema,
  guestCartIdSchema,
  idSchema,
  isoDateTimeSchema,
  passwordSchema,
  usernameSchema,
} from './common/primitives'

/**
 * Session and account (README §3 "Conta e sessão", §5 "Sessão e conta").
 * Mechanism (ADR-005): opaque bearer token returned by login/register, kept
 * in memory + localStorage, sent as `Authorization: Bearer <token>`, and
 * revalidated on reload with `GET /api/auth/session`.
 */

/** Public part of the authenticated user, safe to keep in the session cache. */
export const userSchema = z.object({
  id: idSchema,
  username: usernameSchema,
  email: emailSchema,
  /** Defaults to `username` at registration (not collected by "Cadastro"); editable in the profile. */
  displayName: displayNameSchema,
  avatarUrl: z.string().min(1).nullable(),
})
export type User = z.infer<typeof userSchema>

/** Token-bearing session returned once by login/register. */
export const sessionSchema = z.object({
  token: z.string().min(16),
  expiresAt: isoDateTimeSchema,
  user: userSchema,
})
export type Session = z.infer<typeof sessionSchema>

/** `GET /api/auth/session` → current session without re-sending the token. */
export const sessionInfoSchema = sessionSchema.omit({ token: true })
export type SessionInfo = z.infer<typeof sessionInfoSchema>

/** `POST /api/auth/login`. `guestCartId` merges the visitor cart atomically (ADR-006). */
export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(72),
  guestCartId: guestCartIdSchema.optional(),
})
export type LoginRequest = z.infer<typeof loginRequestSchema>

/** `POST /api/auth/register`. */
export const registerRequestSchema = z.object({
  username: usernameSchema,
  email: emailSchema,
  password: passwordSchema,
  guestCartId: guestCartIdSchema.optional(),
})
export type RegisterRequest = z.infer<typeof registerRequestSchema>

/** Client-side form (Figma "Cadastro"): adds password confirmation, never sent. */
export const registerFormSchema = registerRequestSchema
  .omit({ guestCartId: true })
  .extend({ confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  })
export type RegisterForm = z.infer<typeof registerFormSchema>

/** Login/register response. `cartMerge` is null when no guest cart was sent or it was empty. */
export const authResponseSchema = z.object({
  session: sessionSchema,
  cartMerge: cartMergeResultSchema.nullable(),
})
export type AuthResponse = z.infer<typeof authResponseSchema>
