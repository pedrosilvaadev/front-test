import type { Locator, Page } from '@playwright/test'
import { expect, gotoReady, pageFetch, test } from './fixtures'

/**
 * P2-02 catalog: URL-driven filters, search, tabs, sort and pagination
 * (README §3 "Início"). Runs on both projects: desktop uses the sidebar,
 * mobile the filter sheet opened from the header button.
 */

interface ListSummary {
  firstName: string | undefined
  totalItems: number
  totalPages: number
}

/** Ground truth straight from the mock API (through the page's service worker). */
async function apiList(page: Page, search: string): Promise<ListSummary> {
  const result = await pageFetch(page, `/api/nfts${search}`)
  expect(result.status, `GET /api/nfts${search}`).toBe(200)
  const body = JSON.parse(result.body) as {
    items: { name: string }[]
    page: { totalItems: number; totalPages: number }
  }
  return { firstName: body.items[0]?.name, totalItems: body.page.totalItems, totalPages: body.page.totalPages }
}

async function setScenario(page: Page, name: string): Promise<void> {
  const result = await pageFetch(page, '/api/__dev/scenario', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  expect(result.status, `PUT scenario ${name}`).toBe(200)
}

function results(page: Page): Locator {
  return page.getByRole('list', { name: 'NFTs' })
}

function firstCardTitle(page: Page): Locator {
  return results(page).getByRole('heading', { level: 3 }).first()
}

function statusText(total: number): RegExp {
  return new RegExp(`^${String(total)} NFTs? encontrados?`)
}

/** Waits until the grid shows the settled response for the current URL. */
async function expectResults(page: Page, expected: ListSummary): Promise<void> {
  await expect(page.getByTestId('catalog-status')).toHaveText(statusText(expected.totalItems), { timeout: 15_000 })
  await expect(page.locator('#catalog-results')).toHaveAttribute('aria-busy', 'false', { timeout: 15_000 })
  if (expected.firstName) await expect(firstCardTitle(page)).toHaveText(expected.firstName)
}

/** Filter container: desktop sidebar, or the mobile sheet (opened on demand). */
async function filters(page: Page, isMobile: boolean): Promise<Locator> {
  if (!isMobile) return page.getByRole('complementary', { name: 'Filtros' })
  const dialog = page.getByRole('dialog', { name: 'Filtros' })
  if (!(await dialog.isVisible())) {
    await page.getByRole('banner').getByRole('button', { name: /^Filtros/ }).click()
    await expect(dialog).toBeVisible()
  }
  return dialog
}

async function closeFilters(page: Page, isMobile: boolean): Promise<void> {
  if (!isMobile) return
  // An open select hides the dialog from the a11y tree; wait for it to close first.
  await expect(page.getByRole('listbox')).toHaveCount(0)
  await expect(page.getByRole('dialog', { name: 'Filtros' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Filtros' })).toBeHidden()
}

/** Toggles a sidebar option through its visible label (the checkbox itself is visually hidden). */
async function toggleOption(container: Locator, label: string): Promise<void> {
  await container.locator('label', { hasText: label }).click()
}

function checkbox(container: Locator, label: string): Locator {
  return container.getByRole('checkbox', { name: new RegExp(`^${label}`) })
}

test.describe('catalog', () => {
  test('renders the first page with pagination and announces the count', async ({ page }) => {
    const expected = await apiList(page, '')
    await expectResults(page, expected)
    await expect(results(page).getByRole('listitem')).toHaveCount(9)
    const pagination = page.getByRole('navigation', { name: 'Paginação' })
    await expect(pagination.getByRole('link', { name: 'Página 1' })).toHaveAttribute('aria-current', 'page')
    await expect(pagination.getByRole('link', { name: 'Próxima página' })).toHaveAttribute('href', '/?page=2')
    await expect(firstCardTitle(page).getByRole('link')).toHaveAttribute('href', /^\/nft\//)
  })

  test('filters compose into the URL and survive a reload', async ({ page, isMobile }) => {
    const expected = await apiList(page, '?categories=music&networks=solana&tab=trending')
    let panel = await filters(page, isMobile)
    await toggleOption(panel, 'Música')
    await expect(page).toHaveURL(/\?categories=music$/)
    await toggleOption(panel, 'Solana')
    await expect(page).toHaveURL(/\?categories=music&networks=solana$/)
    await closeFilters(page, isMobile)
    await page.getByRole('tab', { name: 'Em alta' }).click()
    await expect(page).toHaveURL(/\?categories=music&networks=solana&tab=trending$/)
    await expect(page.getByRole('tab', { name: 'Em alta' })).toHaveAttribute('aria-selected', 'true')
    await expectResults(page, expected)

    await page.reload()
    await expect(page).toHaveURL(/\?categories=music&networks=solana&tab=trending$/)
    await expectResults(page, expected)
    await expect(page.getByRole('tab', { name: 'Em alta' })).toHaveAttribute('aria-selected', 'true')
    panel = await filters(page, isMobile)
    await expect(checkbox(panel, 'Música')).toBeChecked()
    await expect(checkbox(panel, 'Solana')).toBeChecked()
    await expect(checkbox(panel, 'Fotografia')).not.toBeChecked()
  })

  test('sorting and price range are written to the URL', async ({ page, isMobile }) => {
    const panel = await filters(page, isMobile)
    await page.getByRole('combobox', { name: 'Ordenar por:' }).click()
    await page.getByRole('option', { name: 'Menor preço' }).click()
    await expect(page).toHaveURL(/\?sort=price-asc$/)

    // Keyboard-operable slider: raise the minimum by 10 steps of 0.01 ETH.
    const min = panel.getByRole('slider', { name: 'Preço mínimo' })
    await min.focus()
    for (let i = 0; i < 10; i += 1) await page.keyboard.press('ArrowRight')
    await expect(min).toHaveAttribute('aria-valuetext', '0,12 ETH')
    await panel.getByRole('button', { name: 'Aplicar faixa de preço' }).click()
    await expect(page).toHaveURL(/\?minPrice=0\.12&sort=price-asc$/)
    await closeFilters(page, isMobile)
    await expectResults(page, await apiList(page, '?minPrice=0.12&sort=price-asc'))
  })

  test('back and forward restore the catalog state', async ({ page, isMobile }) => {
    const pageTwo = await apiList(page, '?page=2')
    const music = await apiList(page, '?categories=music')
    const pagination = page.getByRole('navigation', { name: 'Paginação' })
    await pagination.getByRole('link', { name: 'Página 2' }).click()
    await expect(page).toHaveURL(/\?page=2$/)
    await expectResults(page, pageTwo)

    const panel = await filters(page, isMobile)
    await toggleOption(panel, 'Música')
    // Filter change resets pagination.
    await expect(page).toHaveURL(/\?categories=music$/)
    await closeFilters(page, isMobile)
    await expectResults(page, music)

    await page.goBack()
    await expect(page).toHaveURL(/\?page=2$/)
    await expectResults(page, pageTwo)
    await expect(pagination.getByRole('link', { name: 'Página 2' })).toHaveAttribute('aria-current', 'page')

    await page.goForward()
    await expect(page).toHaveURL(/\?categories=music$/)
    await expectResults(page, music)
  })

  test('changing tab or sort resets the page to 1', async ({ page }) => {
    await gotoReady(page, '/?page=3&sort=name-asc')
    await expectResults(page, await apiList(page, '?page=3&sort=name-asc'))
    await page.getByRole('tab', { name: 'Novos lançamentos' }).click()
    await expect(page).toHaveURL(/\?tab=new&sort=name-asc$/)
    await expectResults(page, await apiList(page, '?tab=new&sort=name-asc'))
    const pagination = page.getByRole('navigation', { name: 'Paginação' })
    await expect(pagination.getByRole('link', { name: 'Página 1' })).toHaveAttribute('aria-current', 'page')
  })

  test('invalid params fall back to defaults per field', async ({ page }) => {
    await gotoReady(page, '/?categories=music,bogus&page=abc&tab=nope')
    await expectResults(page, await apiList(page, '?categories=music'))
  })

  test('empty result offers to clear the filters', async ({ page }) => {
    await gotoReady(page, '/?q=zzzz-nothing&networks=solana')
    await expect(page.getByRole('heading', { name: 'Nenhum NFT encontrado' })).toBeVisible()
    await expect(page.getByTestId('catalog-status')).toHaveText('0 NFTs encontrados')
    await page.locator('#catalog-results').getByRole('button', { name: 'Limpar filtros' }).click()
    await expect(page).toHaveURL(/\/$/)
    await expectResults(page, await apiList(page, ''))
  })

  test('server error shows a retry that recovers once the API is back', async ({ page }) => {
    await gotoReady(page, '/?scenario=server-error&categories=gaming')
    const alert = page.getByRole('alert').filter({ hasText: 'Não foi possível carregar os NFTs' })
    await expect(alert).toBeVisible({ timeout: 15_000 })
    await expect(alert).toContainText('temporariamente indisponível')
    await expect(page.getByRole('navigation', { name: 'Paginação' })).toHaveCount(0)

    await setScenario(page, 'default')
    await alert.getByRole('button', { name: 'Tentar novamente' }).click()
    await expectResults(page, await apiList(page, '?categories=gaming'))
    await expect(alert).toHaveCount(0)
  })

  test('offline shows the connection error', async ({ page }) => {
    await gotoReady(page, '/?scenario=offline')
    const alert = page.getByRole('alert').filter({ hasText: 'Não foi possível carregar os NFTs' })
    await expect(alert).toContainText('Sem conexão', { timeout: 15_000 })
  })

  test('out-of-order responses never overwrite the latest query (variable latency)', async ({ page, isMobile }) => {
    const finalSearch = '?categories=digital-art,music&networks=ethereum,polygon&sort=price-desc'
    const expected = await apiList(page, finalSearch)
    await setScenario(page, 'variable-latency')

    // Rapid discrete changes without waiting for responses.
    const panel = await filters(page, isMobile)
    await toggleOption(panel, 'Música')
    await toggleOption(panel, 'Solana')
    await toggleOption(panel, 'Arte digital')
    await toggleOption(panel, 'Ethereum')
    await toggleOption(panel, 'Solana')
    await toggleOption(panel, 'Polygon')
    await page.getByRole('combobox', { name: 'Ordenar por:' }).click()
    await page.getByRole('option', { name: 'Maior preço' }).click()
    await closeFilters(page, isMobile)

    await expect(page).toHaveURL(new RegExp(`${finalSearch.replace(/[?.]/g, '\\$&')}$`))
    await expectResults(page, expected)
    // Any late response for an intermediate query would land within the max latency (1.2 s).
    await page.waitForTimeout(1_500)
    await expect(page.getByTestId('catalog-status')).toHaveText(statusText(expected.totalItems))
    await expect(firstCardTitle(page)).toHaveText(expected.firstName ?? '')
  })
})

test.describe('mobile search', () => {
  test.skip(({ isMobile }) => !isMobile, 'mobile header only')

  test('typing updates ?q after a pause without adding history entries', async ({ page }) => {
    const expected = await apiList(page, '?q=golden')
    const lengthBefore = await page.evaluate(() => history.length)
    await page.getByRole('searchbox', { name: 'Explorar coleções' }).fill('golden')
    await expect(page).toHaveURL(/\?q=golden$/)
    await expectResults(page, expected)
    expect(await page.evaluate(() => history.length)).toBe(lengthBefore)

    // Clearing the field removes the search from the URL.
    await page.getByRole('searchbox', { name: 'Explorar coleções' }).fill('')
    await expect(page).toHaveURL(/\/$/)
  })
})

test.describe('desktop search', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop header only')

  test('header search writes ?q (debounced, replace) and syncs with the URL', async ({ page }) => {
    const expected = await apiList(page, '?q=nomad')
    const banner = page.getByRole('banner')
    const lengthBefore = await page.evaluate(() => history.length)
    await banner.getByRole('button', { name: 'Buscar' }).click()
    const field = banner.getByRole('searchbox', { name: 'Buscar NFTs' })
    await expect(field).toBeFocused()
    await field.fill('nomad')
    await expect(page).toHaveURL(/\?q=nomad$/)
    await expectResults(page, expected)
    expect(await page.evaluate(() => history.length)).toBe(lengthBefore)
    await expect(page.getByText('Resultados para')).toContainText('nomad')

    // Clearing from the catalog clears the header field too.
    await page.getByRole('button', { name: 'Limpar busca' }).last().click()
    await expect(page).toHaveURL(/\/$/)
    await expect(field).toHaveValue('')
  })

  test('searching from another route navigates to the catalog with q', async ({ page }) => {
    await gotoReady(page, '/rota-inexistente')
    await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible()
    const banner = page.getByRole('banner')
    await banner.getByRole('button', { name: 'Buscar' }).click()
    await banner.getByRole('searchbox', { name: 'Buscar NFTs' }).fill('golden')
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/\?q=golden$/)
    await expectResults(page, await apiList(page, '?q=golden'))
  })
})

test.describe('loading skeleton', () => {
  test('shows shimmering skeletons while the catalog loads (slow scenario)', async ({ page }) => {
    await gotoReady(page, '/?scenario=slow')
    const skeleton = page.getByTestId('catalog-skeleton')
    await expect(skeleton).toBeVisible()
    const card = skeleton.locator('[data-slot="skeleton"]').first()
    await expect(card).toHaveCSS('animation-name', 'shimmer')
    await expect(card).toHaveCSS('animation-iteration-count', 'infinite')
    await expect(page.locator('#catalog-results')).toHaveAttribute('aria-busy', 'true')
    await expect(results(page)).toBeVisible({ timeout: 15_000 })
    await expect(skeleton).toHaveCount(0)
  })

  test('respects prefers-reduced-motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await gotoReady(page, '/?scenario=slow')
    const card = page.getByTestId('catalog-skeleton').locator('[data-slot="skeleton"]').first()
    await expect(card).toBeVisible()
    await expect(card).toHaveCSS('animation-iteration-count', '1')
    await expect(card).toHaveCSS('animation-duration', /^(1e-05s|0\.00001s)$/)
  })
})
