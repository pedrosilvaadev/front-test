import { AxiosError } from 'axios'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '@/mocks/node'
import { ApiError, isApiError, kindFromStatus, toApiError, type ApiErrorKind } from './errors'
import { createApiClient } from './client'

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

describe('ApiError normalization through the Axios client', () => {
  const cases: Array<[number, ApiErrorKind, boolean]> = [
    [400, 'validation', false],
    [422, 'validation', false],
    [401, 'unauthorized', false],
    [403, 'forbidden', false],
    [404, 'not_found', false],
    [409, 'conflict', false],
    [412, 'conflict', false],
    [429, 'transient', true],
    [500, 'transient', true],
    [503, 'transient', true],
  ]

  it.each(cases)('maps HTTP %i with an error envelope to kind %s', async (status, kind, retryable) => {
    const details = { field: 'email' }
    server.use(
      http.get('*/api/probe', () =>
        HttpResponse.json({ error: { code: `CODE_${status}`, message: `Message ${status}`, details } }, { status }),
      ),
    )

    const error = await captureError(client.get('/probe'))

    expect(error).toBeInstanceOf(ApiError)
    expect(error.kind).toBe(kind)
    expect(error.status).toBe(status)
    expect(error.code).toBe(`CODE_${status}`)
    expect(error.message).toBe(`Message ${status}`)
    expect(error.details).toEqual(details)
    expect(error.retryable).toBe(retryable)
  })

  it('falls back to default code/message when the body is not an envelope', async () => {
    server.use(http.get('*/api/probe', () => new HttpResponse('<html>oops</html>', { status: 502 })))

    const error = await captureError(client.get('/probe'))

    expect(error.kind).toBe('transient')
    expect(error.status).toBe(502)
    expect(error.code).toBe('SERVER_UNAVAILABLE')
    expect(error.details).toBeUndefined()
  })

  it('maps a network failure to kind network', async () => {
    server.use(http.get('*/api/probe', () => HttpResponse.error()))

    const error = await captureError(client.get('/probe'))

    expect(error.kind).toBe('network')
    expect(error.status).toBeUndefined()
    expect(error.retryable).toBe(true)
  })
})

describe('error helpers', () => {
  it('kindFromStatus covers timeout and unknown statuses', () => {
    expect(kindFromStatus(408)).toBe('timeout')
    expect(kindFromStatus(412)).toBe('conflict')
    expect(kindFromStatus(418)).toBe('unknown')
  })

  it('toApiError is idempotent and wraps non-Axios errors as unknown', () => {
    const original = new ApiError({ kind: 'conflict' })
    expect(toApiError(original)).toBe(original)

    const wrapped = toApiError(new TypeError('boom'))
    expect(wrapped.kind).toBe('unknown')
    expect(wrapped.message).toBe('boom')
    expect(wrapped.cause).toBeInstanceOf(TypeError)
  })

  it('maps ETIMEDOUT to timeout and a bare ECONNABORTED (browser abort) to canceled', () => {
    const timedOut = toApiError(new AxiosError('timeout of 10ms exceeded', AxiosError.ETIMEDOUT))
    expect(timedOut.kind).toBe('timeout')
    expect(timedOut.retryable).toBe(true)

    const aborted = toApiError(new AxiosError('Request aborted', AxiosError.ECONNABORTED))
    expect(aborted.kind).toBe('canceled')
    expect(aborted.retryable).toBe(false)
  })

  it('isApiError rejects look-alikes', () => {
    expect(isApiError(new Error('x'))).toBe(false)
    expect(isApiError({ kind: 'network' })).toBe(false)
    expect(isApiError(new ApiError({ kind: 'network' }))).toBe(true)
  })
})
