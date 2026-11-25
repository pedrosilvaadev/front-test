import { test as base, expect, type Page } from '@playwright/test'

/** localStorage key used by the mock layer to persist `?scenario=` selections. */
export const SCENARIO_STORAGE_KEY = 'mock:scenario'

export interface FetchResult {
  ok: boolean
  status: number
  contentType: string | null
  body: string
}

/**
 * Waits until the MSW service worker controls the page. Requests issued
 * before this point would bypass the mocks.
 */
export async function waitForMockWorker(page: Page): Promise<void> {
  // The app renders before MSW finishes starting (P6-02); `data-mocks="ready"` is set once it handles requests.
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null && document.documentElement.dataset.mocks === 'ready', undefined, {
    timeout: 15_000,
  })
}

/** Navigates and waits for both the mock worker and the rendered app shell. */
export async function gotoReady(page: Page, path: string): Promise<void> {
  await page.goto(path)
  await waitForMockWorker(page)
  await expect(page.locator('#root')).not.toBeEmpty()
}

/** Issues a same-origin `fetch` from the page (so it goes through the worker). */
export async function pageFetch(page: Page, url: string, init?: RequestInit): Promise<FetchResult> {
  return page.evaluate(
    async ({ url, init }) => {
      const response = await fetch(url, init)
      return {
        ok: response.ok,
        status: response.status,
        contentType: response.headers.get('content-type'),
        body: await response.text(),
      }
    },
    { url, init },
  )
}

/** Like `pageFetch`, but resolves with the error message when the request rejects. */
export async function pageFetchError(page: Page, url: string): Promise<string | null> {
  return page.evaluate(async (target) => {
    try {
      await fetch(target)
      return null
    } catch (error) {
      return error instanceof Error ? error.name : String(error)
    }
  }, url)
}

/**
 * Resets mock state for the current page: clears the persisted scenario and
 * calls `POST /api/__dev/reset` (db + scenario back to `default`).
 * MSW state lives in the page's JS realm, so call it after every full
 * navigation whose state must start clean.
 */
export async function resetMocks(page: Page): Promise<void> {
  await page.evaluate(() => window.localStorage.clear())
  const result = await pageFetch(page, '/api/__dev/reset', { method: 'POST' })
  expect(result.status, 'POST /api/__dev/reset').toBe(204)
}

/**
 * Realtime outage control (P5-01): `false` drops the page's Socket.IO
 * connection and refuses reconnections, so a dev mutation is only seen over
 * REST (server-side revalidation paths); `true` lets the client reconnect.
 */
export async function setRealtimeOnline(page: Page, online: boolean): Promise<void> {
  const result = await pageFetch(page, '/api/__dev/realtime', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ online }),
  })
  expect(result.status, 'PUT /api/__dev/realtime').toBe(200)
}

interface MockFixtures {
  /** Auto fixture: every test starts from `/` with a clean mock state and empty localStorage. */
  mockReset: void
}

export const test = base.extend<MockFixtures>({
  mockReset: [
    async ({ page }, provide) => {
      await gotoReady(page, '/')
      await resetMocks(page)
      await provide()
    },
    { auto: true },
  ],
})

export { expect }
