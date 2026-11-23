import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios'
import { readApiConfig, type ApiConfig } from './config'
import { ApiError, toApiError } from './errors'

/**
 * Timeout signals created per request, keyed by the combined signal handed to
 * the adapter. Used to tell a client timeout apart from a caller abort.
 */
const timeoutSignals = new WeakMap<AbortSignal, AbortSignal>()

/**
 * Enforces `config.timeout` through an AbortSignal combined with the caller's
 * signal. This behaves identically for every adapter and environment (native
 * XHR timeouts are not emitted by intercepted requests in Node/jsdom).
 */
function applyTimeoutSignal(config: InternalAxiosRequestConfig): InternalAxiosRequestConfig {
  const timeoutMs = config.timeout
  if (!timeoutMs || timeoutMs <= 0) return config

  const timeoutSignal = AbortSignal.timeout(timeoutMs)
  const callerSignal = config.signal as AbortSignal | undefined
  const combined = callerSignal ? AbortSignal.any([callerSignal, timeoutSignal]) : timeoutSignal
  timeoutSignals.set(combined, timeoutSignal)
  // NOTE: this mutates the request config. `error.config` (reachable through
  // `ApiError.cause`) carries the combined, possibly already aborted signal and
  // `timeout: 0`, so it must NOT be replayed with `instance.request(error.config)`.
  // Retries must issue a fresh call (TanStack Query does) to get a new timeout.
  config.signal = combined
  // The signal owns the timeout now; avoid a second, adapter-specific timer.
  config.timeout = 0
  return config
}

function isClientTimeout(error: unknown): boolean {
  if (!axios.isCancel(error)) return false
  const signal = (error as { config?: { signal?: unknown } }).config?.signal
  if (!(signal instanceof AbortSignal)) return false
  const timeoutSignal = timeoutSignals.get(signal)
  return timeoutSignal !== undefined && timeoutSignal.aborted && signal.reason === timeoutSignal.reason
}

/**
 * Creates an Axios instance whose rejections are always `ApiError`.
 * The client is transport only and never fabricates responses: mocking
 * happens at the network layer (MSW). Pass `signal` per request for
 * cancellation (TanStack Query provides one to every query function);
 * a caller abort yields kind `canceled`, the client timeout kind `timeout`.
 */
export function createApiClient(config: Partial<ApiConfig> = {}): AxiosInstance {
  const { baseURL, timeoutMs } = { ...readApiConfig(), ...config }
  const instance = axios.create({
    baseURL,
    timeout: timeoutMs,
    headers: { Accept: 'application/json' },
    // If an adapter-level timeout ever fires, report ETIMEDOUT instead of ECONNABORTED.
    transitional: { clarifyTimeoutError: true },
  })

  instance.interceptors.request.use(applyTimeoutSignal)
  instance.interceptors.response.use(undefined, (error: unknown) =>
    Promise.reject(
      isClientTimeout(error) ? new ApiError({ kind: 'timeout', cause: error }) : toApiError(error),
    ),
  )
  return instance
}

/** The single application-wide Axios instance. */
export const apiClient = createApiClient()
