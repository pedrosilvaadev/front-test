import { describe, expect, it } from 'vitest'
import { getDb } from '@/mocks/db'
import {
  getPendingTimeoutCount,
  getScenario,
  nextLatencyMs,
  resetScenario,
  resolveInitialScenario,
  SCENARIO_PRESETS,
  setScenario,
} from '@/mocks/scenario'
import { createApiClient } from './client'
import { isApiError, type ApiError } from './errors'
import { getHealth } from './health'

const client = createApiClient({ baseURL: '/api', timeoutMs: 2000 })

async function captureError(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise
  } catch (error) {
    if (isApiError(error)) return error
    throw new Error(`Expected ApiError, got ${String(error)}`, { cause: error })
  }
  throw new Error('Expected request to fail')
}

describe('health endpoint', () => {
  it('returns 200 through the shared Axios instance', async () => {
    await expect(getHealth()).resolves.toEqual({ status: 'ok' })
  })
})

describe('network scenarios', () => {
  it('fixed latency delays the response', async () => {
    setScenario({ ...SCENARIO_PRESETS.default, name: 'test-fixed', latency: { type: 'fixed', ms: 150 } })

    const started = performance.now()
    const response = await client.get('/health')
    const elapsed = performance.now() - started

    expect(response.status).toBe(200)
    expect(elapsed).toBeGreaterThanOrEqual(140)
  })

  it('variable latency is deterministic for the same seed', () => {
    setScenario('variable-latency', 42)
    const first = [nextLatencyMs(), nextLatencyMs(), nextLatencyMs(), nextLatencyMs()]
    setScenario('variable-latency', 42)
    const second = [nextLatencyMs(), nextLatencyMs(), nextLatencyMs(), nextLatencyMs()]
    setScenario('variable-latency', 7)
    const other = [nextLatencyMs(), nextLatencyMs(), nextLatencyMs(), nextLatencyMs()]

    expect(second).toEqual(first)
    expect(other).not.toEqual(first)
    for (const ms of first) {
      expect(ms).toBeGreaterThanOrEqual(100)
      expect(ms).toBeLessThanOrEqual(1200)
    }
  })

  it('variable latency delays real requests within bounds', async () => {
    setScenario({
      ...SCENARIO_PRESETS.default,
      name: 'test-variable',
      latency: { type: 'variable', minMs: 60, maxMs: 90 },
    })

    const started = performance.now()
    await client.get('/health')
    expect(performance.now() - started).toBeGreaterThanOrEqual(55)
  })

  it('server-error preset returns the error envelope as transient', async () => {
    setScenario('server-error')

    const error = await captureError(client.get('/health'))

    expect(error.kind).toBe('transient')
    expect(error.status).toBe(500)
    expect(error.code).toBe('INTERNAL_ERROR')
  })

  it('forced HTTP error can target a path, method and a limited number of requests', async () => {
    setScenario({
      ...SCENARIO_PRESETS.default,
      name: 'test-conflict-once',
      failure: { type: 'http', status: 409, code: 'VERSION_CONFLICT', message: 'Stale.' },
      pathPrefix: '/api/health',
      methods: ['GET'],
      failureCount: 1,
    })

    const error = await captureError(client.get('/health'))
    expect(error.kind).toBe('conflict')
    expect(error.code).toBe('VERSION_CONFLICT')

    await expect(client.get('/health')).resolves.toMatchObject({ status: 200 })
  })

  it('offline preset produces kind network', async () => {
    setScenario('offline')

    const error = await captureError(client.get('/health'))

    expect(error.kind).toBe('network')
    expect(error.retryable).toBe(true)
  })

  it('timeout preset produces kind timeout via the client timeout', async () => {
    setScenario('timeout')
    const fastClient = createApiClient({ baseURL: '/api', timeoutMs: 100 })

    const error = await captureError(fastClient.get('/health'))

    expect(error.kind).toBe('timeout')
    expect(error.code).toBe('TIMEOUT')
    expect(error.retryable).toBe(true)
  })

  it('per-request timeout overrides the instance default and still honours the caller signal', async () => {
    setScenario('timeout')
    const controller = new AbortController()

    const error = await captureError(client.get('/health', { timeout: 50, signal: controller.signal }))

    expect(error.kind).toBe('timeout')
    expect(controller.signal.aborted).toBe(false)
  })

  it('aborting via AbortSignal yields kind canceled, distinct from timeout', async () => {
    setScenario('timeout')
    const controller = new AbortController()
    const pending = captureError(client.get('/health', { signal: controller.signal }))
    setTimeout(() => controller.abort(), 20)

    const error = await pending

    expect(error.kind).toBe('canceled')
    expect(error.retryable).toBe(false)
  })

  it('a caller abort still wins over a longer per-request timeout', async () => {
    setScenario('timeout')
    const controller = new AbortController()
    const pending = captureError(client.get('/health', { timeout: 1000, signal: controller.signal }))
    setTimeout(() => controller.abort(), 20)

    const error = await pending

    expect(error.kind).toBe('canceled')
  })

  it('timeout scenario holds requests boundedly and releases them on scenario reset', async () => {
    setScenario({ ...SCENARIO_PRESETS.default, name: 'test-hold', failure: { type: 'timeout', holdMs: 120 } })
    const fastClient = createApiClient({ baseURL: '/api', timeoutMs: 40 })

    const timedOut = await captureError(fastClient.get('/health'))
    expect(timedOut.kind).toBe('timeout')
    expect(getPendingTimeoutCount()).toBe(1)

    await new Promise((resolve) => setTimeout(resolve, 150))
    expect(getPendingTimeoutCount()).toBe(0)

    setScenario('timeout')
    const pending = captureError(fastClient.get('/health'))
    await expect(pending).resolves.toMatchObject({ kind: 'timeout' })
    expect(getPendingTimeoutCount()).toBe(1)

    resetScenario()
    expect(getPendingTimeoutCount()).toBe(0)
  })

  it('a signal aborted before sending is reported as canceled', async () => {
    const controller = new AbortController()
    controller.abort()

    const error = await captureError(getHealth(controller.signal))

    expect(error.kind).toBe('canceled')
  })
})

describe('dev control endpoints', () => {
  it('are not affected by the active scenario and reset db + scenario', async () => {
    setScenario('offline')
    const generation = getDb().generation

    const response = await client.post('/__dev/reset')

    expect(response.status).toBe(204)
    expect(getScenario().name).toBe('default')
    expect(getDb().generation).toBe(generation + 1)
    await expect(getHealth()).resolves.toEqual({ status: 'ok' })
  })

  it('PUT /__dev/scenario selects a preset with a seed', async () => {
    const response = await client.put('/__dev/scenario', { name: 'slow', seed: 9 })

    expect(response.data).toMatchObject({ name: 'slow', seed: 9 })
    expect(getScenario().name).toBe('slow')
  })

  it('PUT /__dev/scenario rejects unknown presets with a validation error', async () => {
    const error = await captureError(client.put('/__dev/scenario', { name: 'nope' }))

    expect(error.kind).toBe('validation')
    expect(error.code).toBe('UNKNOWN_SCENARIO')
  })
})

describe('resolveInitialScenario', () => {
  function memoryStorage(initial: Record<string, string> = {}) {
    const data = new Map(Object.entries(initial))
    return {
      data,
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => void data.set(key, value),
      removeItem: (key: string) => void data.delete(key),
    }
  }

  it('prefers the query string and persists it', () => {
    const storage = memoryStorage()
    expect(resolveInitialScenario('?scenario=offline&seed=3', storage)).toEqual({ name: 'offline', seed: 3 })
    expect(resolveInitialScenario('', storage)).toEqual({ name: 'offline', seed: 3 })
  })

  it('?scenario=default clears the persisted selection', () => {
    const storage = memoryStorage({ 'mock:scenario': JSON.stringify({ name: 'slow' }) })
    expect(resolveInitialScenario('?scenario=default', storage).name).toBe('default')
    expect(storage.data.has('mock:scenario')).toBe(false)
  })

  it('ignores unknown or corrupt values', () => {
    expect(resolveInitialScenario('?scenario=bogus', memoryStorage()).name).toBe('default')
    expect(resolveInitialScenario('', memoryStorage({ 'mock:scenario': '{not json' })).name).toBe('default')
    expect(resolveInitialScenario('', undefined).name).toBe('default')
  })
})
