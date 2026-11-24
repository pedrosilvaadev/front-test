import {
  expect,
  gotoReady,
  pageFetch,
  pageFetchError,
  SCENARIO_STORAGE_KEY,
  test,
  waitForMockWorker,
} from './fixtures'

test.describe('app shell', () => {
  test('renders the home page heading', async ({ page }, testInfo) => {
    await gotoReady(page, '/')
    await expect(page.getByRole('heading', { level: 1, name: /^SEJA DONO D/ })).toBeVisible()
    if (testInfo.project.name === 'chromium-mobile') {
      // Mobile header has no logo; home is reached through the bottom tab bar.
      const home = page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Início', exact: true })
      await expect(home).toBeVisible()
      await expect(home).toHaveAttribute('href', '/')
    } else {
      const logo = page.getByRole('link', { name: 'KURIO', exact: true })
      await expect(logo).toBeVisible()
      await expect(logo).toHaveAttribute('href', '/')
    }
  })

  test('shows the not-found page for unknown routes', async ({ page }) => {
    await gotoReady(page, '/this-route-does-not-exist')
    await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible()
    await page.getByRole('link', { name: 'Back to home' }).click()
    await expect(page).toHaveURL('/')
    await expect(page.getByRole('heading', { level: 1, name: /^SEJA DONO D/ })).toBeVisible()
  })
})

test.describe('mock service worker', () => {
  test('is active in the demo build and serves /api/health', async ({ page }) => {
    await gotoReady(page, '/')
    const controller = await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? null)
    expect(controller).toMatch(/\/mockServiceWorker\.js$/)

    const health = await pageFetch(page, '/api/health')
    expect(health.status).toBe(200)
    expect(health.contentType).toContain('application/json')
    expect(JSON.parse(health.body)).toEqual({ status: 'ok' })
  })

  test('answers unknown /api routes with a 404 error envelope', async ({ page }) => {
    await gotoReady(page, '/')
    const result = await pageFetch(page, '/api/does-not-exist')
    expect(result.status).toBe(404)
    expect(JSON.parse(result.body)).toMatchObject({ error: { code: 'ROUTE_NOT_FOUND' } })
  })

  test('?scenario=server-error fails /api/health and ?scenario=default restores it', async ({ page }) => {
    await gotoReady(page, '/?scenario=server-error')
    const failed = await pageFetch(page, '/api/health')
    expect(failed.status).toBeGreaterThanOrEqual(500)
    expect(failed.status).toBeLessThan(600)
    expect(JSON.parse(failed.body)).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Simulated server error.' },
    })

    // The selection persists across a plain reload.
    expect(await page.evaluate((key) => localStorage.getItem(key), SCENARIO_STORAGE_KEY)).toContain('server-error')
    // The controller exists as soon as the reloaded document loads, but the MSW
    // client only answers after `worker.start()` resolves (the app renders
    // after it). Fetching in between bypasses the mocks, so wait for the shell.
    await page.reload()
    await waitForMockWorker(page)
    await expect(page.locator('#root')).not.toBeEmpty()
    expect((await pageFetch(page, '/api/health')).status).toBe(500)

    await gotoReady(page, '/?scenario=default')
    const restored = await pageFetch(page, '/api/health')
    expect(restored.status).toBe(200)
    expect(JSON.parse(restored.body)).toEqual({ status: 'ok' })
    expect(await page.evaluate((key) => localStorage.getItem(key), SCENARIO_STORAGE_KEY)).toBeNull()
  })

  test('does not intercept non-API requests while scenario=offline is active', async ({ page }) => {
    await gotoReady(page, '/?scenario=offline')
    await expect(page.getByRole('heading', { level: 1, name: /^SEJA DONO D/ })).toBeVisible()

    // API requests are failed by the offline scenario...
    expect(await pageFetchError(page, '/api/health')).toBe('TypeError')

    // ...while static assets and built modules pass through to the preview server.
    const favicon = await pageFetch(page, '/favicon.svg')
    expect(favicon.status).toBe(200)
    expect(favicon.contentType).toContain('image/svg+xml')
    expect(favicon.body).toContain('<svg')

    const entryScript = await page.locator('script[type="module"][src]').first().getAttribute('src')
    expect(entryScript).toBeTruthy()
    const module = await pageFetch(page, entryScript ?? '')
    expect(module.status).toBe(200)
    expect(module.contentType).toMatch(/javascript/)
  })
})

test.describe('isolation', () => {
  test('each test starts with no persisted scenario', async ({ page }) => {
    expect(await page.evaluate((key) => localStorage.getItem(key), SCENARIO_STORAGE_KEY)).toBeNull()
    expect((await pageFetch(page, '/api/health')).status).toBe(200)
    const scenario = await pageFetch(page, '/api/__dev/scenario')
    expect(JSON.parse(scenario.body)).toMatchObject({ name: 'default' })
  })
})
