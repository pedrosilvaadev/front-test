export const DEFAULT_API_BASE_URL = '/api'
export const DEFAULT_API_TIMEOUT_MS = 10_000

export interface ApiConfig {
  baseURL: string
  timeoutMs: number
}

/** Parses a positive integer timeout; falls back to the default on invalid input. */
export function parseTimeoutMs(raw: string | undefined, fallback = DEFAULT_API_TIMEOUT_MS): number {
  if (raw === undefined || raw.trim() === '') return fallback
  const value = Number(raw)
  return Number.isInteger(value) && value > 0 ? value : fallback
}

export function readApiConfig(env: ImportMetaEnv = import.meta.env): ApiConfig {
  const baseURL = env.VITE_API_BASE_URL?.trim()
  return {
    baseURL: baseURL ? baseURL : DEFAULT_API_BASE_URL,
    timeoutMs: parseTimeoutMs(env.VITE_API_TIMEOUT_MS),
  }
}
