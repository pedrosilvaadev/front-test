import type { AxiosRequestConfig } from 'axios'
import {
  profileSchema,
  type ChangePasswordRequest,
  type Profile,
  type UpdateAvatarRequest,
  type UpdateProfileRequest,
} from '@/contracts'
import { apiClient } from './client'

/**
 * Collector profile API (docs/API_CONTRACTS.md "Profile"). Transport only.
 * `token`, when given, is sent instead of the current bearer so a request
 * built for user A can never be answered with user B's data (ADR-004).
 */
export interface UserRequestOptions {
  signal?: AbortSignal
  token?: string
}

export function userConfig({ signal, token }: UserRequestOptions = {}): AxiosRequestConfig {
  return token ? { signal, headers: { Authorization: `Bearer ${token}` } } : { signal }
}

export async function getProfile(options: UserRequestOptions = {}): Promise<Profile> {
  const { data } = await apiClient.get<unknown>('/profile', userConfig(options))
  return profileSchema.parse(data)
}

/** `PUT /api/profile`; 422 / 409 `EMAIL_TAKEN` / `USERNAME_TAKEN`. */
export async function updateProfile(body: UpdateProfileRequest, options: UserRequestOptions = {}): Promise<Profile> {
  const { data } = await apiClient.put<unknown>('/profile', body, userConfig(options))
  return profileSchema.parse(data)
}

/** `PUT /api/profile/avatar` (data URL); 422 on type/size. */
export async function updateAvatar(body: UpdateAvatarRequest, options: UserRequestOptions = {}): Promise<Profile> {
  const { data } = await apiClient.put<unknown>('/profile/avatar', body, userConfig(options))
  return profileSchema.parse(data)
}

export async function removeAvatar(options: UserRequestOptions = {}): Promise<Profile> {
  const { data } = await apiClient.delete<unknown>('/profile/avatar', userConfig(options))
  return profileSchema.parse(data)
}

/** `POST /api/profile/password` → 204; 422 `CURRENT_PASSWORD_INVALID`. */
export async function changePassword(body: ChangePasswordRequest, options: UserRequestOptions = {}): Promise<void> {
  await apiClient.post('/profile/password', body, userConfig(options))
}
