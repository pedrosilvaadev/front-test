import {
  authResponseSchema,
  sessionInfoSchema,
  type AuthResponse,
  type LoginRequest,
  type RegisterRequest,
  type SessionInfo,
} from '@/contracts'
import { apiClient } from './client'
import type { RequestOptions } from './nfts'

/**
 * Session and account API (docs/API_CONTRACTS.md "Session and account").
 * Transport only. Every call opts out of the session bridge (`skipAuth`):
 * login/register are public, and session/logout send the token they are
 * given explicitly and handle their own 401s, so they never trigger the
 * global "session lost" flow (`INVALID_CREDENTIALS` stays a form error).
 */

function bearer(token: string) {
  return { Authorization: `Bearer ${token}` }
}

/** `POST /api/auth/register` → 201 `AuthResponse`. */
export async function register(body: RegisterRequest, { signal }: RequestOptions = {}): Promise<AuthResponse> {
  const { data } = await apiClient.post<unknown>('/auth/register', body, { signal, skipAuth: true })
  return authResponseSchema.parse(data)
}

/** `POST /api/auth/login` → 200 `AuthResponse`; 401 `INVALID_CREDENTIALS`. */
export async function login(body: LoginRequest, { signal }: RequestOptions = {}): Promise<AuthResponse> {
  const { data } = await apiClient.post<unknown>('/auth/login', body, { signal, skipAuth: true })
  return authResponseSchema.parse(data)
}

/** `GET /api/auth/session` for `token`; 401 `UNAUTHORIZED` / `SESSION_EXPIRED`. */
export async function getSession(token: string, { signal }: RequestOptions = {}): Promise<SessionInfo> {
  const { data } = await apiClient.get<unknown>('/auth/session', { signal, headers: bearer(token), skipAuth: true })
  return sessionInfoSchema.parse(data)
}

/** `POST /api/auth/logout` revoking `token` (idempotent 204). */
export async function logout(token: string): Promise<void> {
  await apiClient.post('/auth/logout', undefined, { headers: bearer(token), skipAuth: true })
}
