import { delay, http, HttpResponse } from 'msw'
import { API_ROUTE_PATTERN, DEV_PREFIX, errorResponse, isMockApiUrl } from './http'
import { createRng, randomInt } from './rng'

/**
 * Network-condition scenarios applied at the MSW layer, before any resource
 * handler runs. Components, hooks and the Axios client stay unaware of them.
 *
 * Selection (first match wins):
 *  1. Test API: `setScenario('slow')` / `setScenario({ ...config })`.
 *  2. Dev endpoint: `PUT /api/__dev/scenario` with `{ "name": "offline", "seed": 7 }`.
 *  3. Browser start-up: `?scenario=<preset>&seed=<n>` (persisted to localStorage),
 *     otherwise the persisted localStorage value, otherwise `default`.
 * `resetScenario()` / `POST /api/__dev/reset` restore `default`.
 */

export type LatencyConfig =
  | { type: 'none' }
  | { type: 'fixed'; ms: number }
  | { type: 'variable'; minMs: number; maxMs: number }

export type FailureConfig =
  | { type: 'none' }
  | { type: 'http'; status: number; code?: string; message?: string }
  | { type: 'network' }
  /**
   * Hold the request without responding so the client times out. Released on
   * client abort (when the interceptor propagates it), after `holdMs`, or when
   * the scenario changes/resets, and then answered with a network error.
   */
  | { type: 'timeout'; holdMs?: number }

export interface NetworkScenario {
  name: string
  latency: LatencyConfig
  failure: FailureConfig
  /** Seed for variable latency; same seed + same request order = same delays. */
  seed: number
  /** Only requests whose pathname starts with this prefix are affected. */
  pathPrefix?: string
  /** Only these HTTP methods are affected (upper case). */
  methods?: readonly string[]
  /** Apply the failure to the first N matching requests only, then pass through. */
  failureCount?: number
}

export const DEFAULT_SEED = 1
/** Default upper bound for held `timeout` requests; well above the client timeout. */
export const DEFAULT_TIMEOUT_HOLD_MS = 60_000

const NO_LATENCY: LatencyConfig = { type: 'none' }
const NO_FAILURE: FailureConfig = { type: 'none' }

export const SCENARIO_PRESETS = {
  default: { name: 'default', latency: NO_LATENCY, failure: NO_FAILURE, seed: DEFAULT_SEED },
  slow: { name: 'slow', latency: { type: 'fixed', ms: 1500 }, failure: NO_FAILURE, seed: DEFAULT_SEED },
  'variable-latency': {
    name: 'variable-latency',
    latency: { type: 'variable', minMs: 100, maxMs: 1200 },
    failure: NO_FAILURE,
    seed: DEFAULT_SEED,
  },
  'server-error': {
    name: 'server-error',
    latency: NO_LATENCY,
    failure: { type: 'http', status: 500, code: 'INTERNAL_ERROR', message: 'Simulated server error.' },
    seed: DEFAULT_SEED,
  },
  offline: { name: 'offline', latency: NO_LATENCY, failure: { type: 'network' }, seed: DEFAULT_SEED },
  timeout: { name: 'timeout', latency: NO_LATENCY, failure: { type: 'timeout' }, seed: DEFAULT_SEED },
} as const satisfies Record<string, NetworkScenario>

export type ScenarioPresetName = keyof typeof SCENARIO_PRESETS

export function isScenarioPresetName(value: unknown): value is ScenarioPresetName {
  return typeof value === 'string' && Object.hasOwn(SCENARIO_PRESETS, value)
}

type ScenarioListener = (scenario: NetworkScenario) => void

let active: NetworkScenario = SCENARIO_PRESETS.default
let rng = createRng(active.seed)
let failuresApplied = 0
const listeners = new Set<ScenarioListener>()
const heldRequests = new Set<() => void>()

export function getScenario(): NetworkScenario {
  return active
}

/** Number of `timeout` requests still held open (diagnostics/tests). */
export function getPendingTimeoutCount(): number {
  return heldRequests.size
}

function releaseHeldRequests(): void {
  for (const release of [...heldRequests]) release()
}

/** Activates a preset (optionally with a seed) or a full custom scenario. */
export function setScenario(input: ScenarioPresetName | NetworkScenario, seed?: number): NetworkScenario {
  const base: NetworkScenario = typeof input === 'string' ? SCENARIO_PRESETS[input] : input
  active = seed === undefined ? base : { ...base, seed }
  rng = createRng(active.seed)
  failuresApplied = 0
  // Requests held by a previous `timeout` scenario must not outlive it.
  releaseHeldRequests()
  for (const listener of listeners) listener(active)
  return active
}

export function resetScenario(): NetworkScenario {
  return setScenario('default')
}

export function subscribeScenario(listener: ScenarioListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function appliesTo(scenario: NetworkScenario, method: string, pathname: string): boolean {
  if (scenario.pathPrefix && !pathname.startsWith(scenario.pathPrefix)) return false
  if (scenario.methods && !scenario.methods.includes(method.toUpperCase())) return false
  return true
}

/** Next latency in ms for the active scenario. Advances the seeded RNG for variable latency. */
export function nextLatencyMs(): number {
  const { latency } = active
  switch (latency.type) {
    case 'none':
      return 0
    case 'fixed':
      return latency.ms
    case 'variable':
      return randomInt(rng, latency.minMs, latency.maxMs)
  }
}

function takeFailure(): FailureConfig {
  const { failure, failureCount } = active
  if (failure.type === 'none') return failure
  if (failureCount !== undefined && failuresApplied >= failureCount) return NO_FAILURE
  failuresApplied += 1
  return failure
}

/**
 * Holds a request until the client aborts it, `holdMs` elapses, or the
 * scenario changes. Bounded so no resolver is leaked: MSW's XHR interceptor
 * in Node/jsdom does not propagate client aborts to `request.signal`.
 */
function holdRequest(signal: AbortSignal, holdMs: number): Promise<void> {
  return new Promise((resolve) => {
    const release = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', release)
      heldRequests.delete(release)
      resolve()
    }
    const timer = setTimeout(release, holdMs)
    heldRequests.add(release)
    if (signal.aborted) release()
    else signal.addEventListener('abort', release, { once: true })
  })
}

/**
 * Global middleware: must be the first handler. Applies latency and failure,
 * then returns nothing so MSW falls through to the resource handler.
 * Dev/control endpoints are never affected so tests can always reset.
 */
export const scenarioHandler = http.all(API_ROUTE_PATTERN, async ({ request }) => {
  const url = new URL(request.url)
  if (!isMockApiUrl(url)) return undefined
  if (url.pathname.startsWith(`${DEV_PREFIX}/`)) return undefined
  if (!appliesTo(active, request.method, url.pathname)) return undefined

  const latencyMs = nextLatencyMs()
  const failure = takeFailure()
  if (latencyMs > 0) await delay(latencyMs)

  switch (failure.type) {
    case 'none':
      return undefined
    case 'network':
      return HttpResponse.error()
    case 'timeout':
      // Never fall through afterwards: an abandoned request must not reach business handlers.
      await holdRequest(request.signal, failure.holdMs ?? DEFAULT_TIMEOUT_HOLD_MS)
      return HttpResponse.error()
    case 'http':
      return errorResponse(
        failure.status,
        failure.code ?? `HTTP_${failure.status}`,
        failure.message ?? `Simulated HTTP ${failure.status}.`,
      )
  }
})

const STORAGE_KEY = 'mock:scenario'

interface StoredScenario {
  name: ScenarioPresetName
  seed?: number
}

function parseSeed(raw: string | null | undefined): number | undefined {
  if (raw === null || raw === undefined || raw === '') return undefined
  const value = Number(raw)
  return Number.isInteger(value) ? value : undefined
}

/**
 * Resolves the start-up scenario from the URL query string or storage, and
 * persists URL selections so full-page reloads keep the same conditions.
 * `?scenario=default` clears the persisted value.
 */
export function resolveInitialScenario(
  search: string,
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | undefined,
): StoredScenario {
  const params = new URLSearchParams(search)
  const fromQuery = params.get('scenario')
  if (isScenarioPresetName(fromQuery)) {
    const selected: StoredScenario = { name: fromQuery, seed: parseSeed(params.get('seed')) }
    try {
      if (fromQuery === 'default') storage?.removeItem(STORAGE_KEY)
      else storage?.setItem(STORAGE_KEY, JSON.stringify(selected))
    } catch {
      // Storage may be unavailable (privacy mode); the URL selection still applies.
    }
    return selected
  }

  try {
    const raw = storage?.getItem(STORAGE_KEY)
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      if (typeof parsed === 'object' && parsed !== null && 'name' in parsed && isScenarioPresetName(parsed.name)) {
        const seed = 'seed' in parsed && typeof parsed.seed === 'number' ? parsed.seed : undefined
        return { name: parsed.name, seed }
      }
    }
  } catch {
    // Corrupt or inaccessible storage falls back to the default scenario.
  }
  return { name: 'default' }
}
