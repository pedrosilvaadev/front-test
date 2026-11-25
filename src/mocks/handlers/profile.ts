import { http, HttpResponse, type DefaultBodyType, type PathParams } from 'msw'
import type { ErrorEnvelope } from '@/api/errors'
import {
  changePasswordRequestSchema,
  toFieldErrorsDetails,
  updateAvatarRequestSchema,
  updateProfileRequestSchema,
  type Profile,
  type UpdateProfileRequest,
} from '@/contracts'
import { getDb, updateDb } from '../db'
import { apiPath, errorResponse } from '../http'
import { hashPassword, verifyPassword } from '../password'
import { randomHex } from '../sessions'
import { invalidJson, readJsonBody } from './cart'
import { requireUser } from './wallets'

/**
 * Collector profile (docs/API_CONTRACTS.md "Profile", P3-02). Session fields
 * (`displayName`, `username`, `email`, `avatarUrl`) live on the user record so
 * `GET /api/auth/session` reflects them; `ensName`/`walletNickname` live in a
 * per-user profile record. Every operation is scoped to the bearer's user.
 */

export function readProfile(userId: string): Profile | undefined {
  const db = getDb()
  const record = db.users.find((u) => u.user.id === userId)
  if (!record) return undefined
  const extra = db.profiles.find((p) => p.userId === userId)
  return {
    userId,
    displayName: record.user.displayName,
    username: record.user.username,
    email: record.user.email,
    ensName: extra?.ensName ?? null,
    walletNickname: extra?.walletNickname ?? null,
    avatarUrl: record.user.avatarUrl,
    updatedAt: extra?.updatedAt ?? record.createdAt,
  }
}

function touchProfile(userId: string, patch: Partial<Pick<Profile, 'ensName' | 'walletNickname'>>, at: string) {
  updateDb((state) => {
    const current = state.profiles.find((p) => p.userId === userId)
    const next = {
      userId,
      ensName: current?.ensName ?? null,
      walletNickname: current?.walletNickname ?? null,
      ...patch,
      updatedAt: at,
    }
    state.profiles = [...state.profiles.filter((p) => p.userId !== userId), next]
  })
}

export type UpdateProfileResult = { ok: true; profile: Profile } | { ok: false; code: 'EMAIL_TAKEN' | 'USERNAME_TAKEN' }

export function updateProfile(userId: string, input: UpdateProfileRequest, now = Date.now()): UpdateProfileResult {
  const others = getDb().users.filter((u) => u.user.id !== userId)
  if (others.some((u) => u.user.email === input.email)) return { ok: false, code: 'EMAIL_TAKEN' }
  if (others.some((u) => u.user.username === input.username)) return { ok: false, code: 'USERNAME_TAKEN' }
  const at = new Date(now).toISOString()
  updateDb((state) => {
    for (const record of state.users) {
      if (record.user.id !== userId) continue
      record.user = { ...record.user, displayName: input.displayName, username: input.username, email: input.email }
    }
  })
  touchProfile(userId, { ensName: input.ensName, walletNickname: input.walletNickname }, at)
  return { ok: true, profile: readProfile(userId)! }
}

export function setAvatar(userId: string, avatarUrl: string | null, now = Date.now()): Profile {
  updateDb((state) => {
    for (const record of state.users) if (record.user.id === userId) record.user = { ...record.user, avatarUrl }
  })
  touchProfile(userId, {}, new Date(now).toISOString())
  return readProfile(userId)!
}

const unauthorized = () => errorResponse(401, 'UNAUTHORIZED', 'Authentication required.')

export const profileHandlers = [
  http.get<PathParams, DefaultBodyType, Profile | ErrorEnvelope>(apiPath('/profile'), async ({ request }) => {
    const user = await requireUser(request)
    if (!user.ok) return user.response
    const profile = readProfile(user.userId)
    return profile ? HttpResponse.json<Profile>(profile) : unauthorized()
  }),

  http.put<PathParams, DefaultBodyType, Profile | ErrorEnvelope>(apiPath('/profile'), async ({ request }) => {
    const user = await requireUser(request)
    if (!user.ok) return user.response
    const json = await readJsonBody(request)
    if (!json.ok) return invalidJson()
    const parsed = updateProfileRequestSchema.safeParse(json.body)
    if (!parsed.success) {
      return errorResponse(422, 'VALIDATION_ERROR', 'Invalid profile.', toFieldErrorsDetails(parsed.error))
    }
    const result = updateProfile(user.userId, parsed.data)
    if (result.ok) return HttpResponse.json<Profile>(result.profile)
    return result.code === 'EMAIL_TAKEN'
      ? errorResponse(409, 'EMAIL_TAKEN', 'Email already registered.', { fieldErrors: { email: ['Email already registered.'] } })
      : errorResponse(409, 'USERNAME_TAKEN', 'Username already taken.', { fieldErrors: { username: ['Username already taken.'] } })
  }),

  http.put<PathParams, DefaultBodyType, Profile | ErrorEnvelope>(apiPath('/profile/avatar'), async ({ request }) => {
    const user = await requireUser(request)
    if (!user.ok) return user.response
    const json = await readJsonBody(request)
    if (!json.ok) return invalidJson()
    const parsed = updateAvatarRequestSchema.safeParse(json.body)
    if (!parsed.success) {
      return errorResponse(422, 'VALIDATION_ERROR', 'Invalid avatar.', toFieldErrorsDetails(parsed.error))
    }
    return HttpResponse.json<Profile>(setAvatar(user.userId, parsed.data.dataUrl))
  }),

  http.delete<PathParams, DefaultBodyType, Profile | ErrorEnvelope>(apiPath('/profile/avatar'), async ({ request }) => {
    const user = await requireUser(request)
    if (!user.ok) return user.response
    return HttpResponse.json<Profile>(setAvatar(user.userId, null))
  }),

  http.post<PathParams, DefaultBodyType, ErrorEnvelope>(apiPath('/profile/password'), async ({ request }) => {
    const user = await requireUser(request)
    if (!user.ok) return user.response
    const json = await readJsonBody(request)
    if (!json.ok) return invalidJson()
    const parsed = changePasswordRequestSchema.safeParse(json.body)
    if (!parsed.success) {
      return errorResponse(422, 'VALIDATION_ERROR', 'Invalid password change.', toFieldErrorsDetails(parsed.error))
    }
    const record = getDb().users.find((u) => u.user.id === user.userId)
    if (!record) return unauthorized()
    const valid = await verifyPassword(parsed.data.currentPassword, record.passwordSalt, record.passwordHash)
    if (!valid) {
      return errorResponse(422, 'CURRENT_PASSWORD_INVALID', 'Current password is incorrect.', {
        fieldErrors: { currentPassword: ['Current password is incorrect.'] },
      })
    }
    const passwordSalt = randomHex(16)
    const passwordHash = await hashPassword(parsed.data.newPassword, passwordSalt)
    updateDb((state) => {
      for (const r of state.users) if (r.user.id === user.userId) Object.assign(r, { passwordSalt, passwordHash })
    })
    return new HttpResponse(null, { status: 204 })
  }),
]
