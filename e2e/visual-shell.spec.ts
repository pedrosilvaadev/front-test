import type { Page, TestInfo } from '@playwright/test'
import { expect, gotoReady, pageFetch, test } from './fixtures'

const ART_KEYS = ['emerald-ape', 'sage-nomad', 'ivory-baron', 'golden-beat'] as const

async function saveScreenshot(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(`${name}.png`)
  await page.screenshot({ path, fullPage: true, animations: 'disabled' })
  await testInfo.attach(name, { path, contentType: 'image/png' })
}

async function expectNoHorizontalOverflow(page: Page) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }))
  expect(scrollWidth, 'document must not scroll horizontally').toBeLessThanOrEqual(innerWidth)
}

/** Focus ring = Tailwind `ring` (box-shadow) or a non-none outline. */
async function hasVisibleFocusIndicator(page: Page) {
  return page.evaluate(() => {
    const el = document.activeElement
    if (!el) return false
    const style = getComputedStyle(el)
    return style.boxShadow !== 'none' || (style.outlineStyle !== 'none' && style.outlineWidth !== '0px')
  })
}

test.describe('layout shell', () => {
  test('exposes landmarks and a working skip link', async ({ page }) => {
    await gotoReady(page, '/')
    await expect(page.getByRole('banner')).toBeVisible()
    await expect(page.getByRole('main')).toBeVisible()
    await expect(page.getByRole('contentinfo')).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Principal' })).toBeVisible()

    await page.keyboard.press('Tab')
    const skip = page.getByRole('link', { name: 'Pular para o conteúdo' })
    await expect(skip).toBeFocused()
    await expect(skip).toBeVisible()
    expect(await hasVisibleFocusIndicator(page)).toBe(true)
    await page.keyboard.press('Enter')
    await expect(page.getByRole('main')).toBeFocused()
  })

  test('uses the Kurio theme and self-hosted monospace font', async ({ page }) => {
    await gotoReady(page, '/')
    const styles = await page.evaluate(() => {
      const body = getComputedStyle(document.body)
      return { background: body.backgroundColor, color: body.color, font: body.fontFamily }
    })
    expect(styles.background).toBe('rgb(20, 13, 10)')
    expect(styles.color).toBe('rgb(245, 241, 235)')
    expect(styles.font).toContain('Roboto Mono Variable')
    await page.evaluate(() => document.fonts.ready)
    expect(await page.evaluate(() => document.fonts.check('16px "Roboto Mono Variable"'))).toBe(true)
  })

  test('serves the cropped NFT art as webp', async ({ page }) => {
    await gotoReady(page, '/')
    for (const key of ART_KEYS) {
      const result = await pageFetch(page, `/nfts/${key}.webp`)
      expect(result.status, key).toBe(200)
      expect(result.contentType, key).toContain('image/webp')
    }
  })
})

test.describe('desktop header and footer', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop layout only')

  test('nav is keyboard reachable with active and unavailable states', async ({ page }, testInfo) => {
    await gotoReady(page, '/')
    const banner = page.getByRole('banner')
    const nav = banner.getByRole('navigation', { name: 'Principal' })
    const home = nav.getByRole('link', { name: 'Início' })
    await expect(home).toHaveAttribute('aria-current', 'page')
    await expect(home).toHaveCSS('color', 'rgb(232, 155, 85)')

    for (const section of ['Mercado', 'Criadores', 'Aprenda']) {
      const link = nav.getByRole('link', { name: `${section} (em breve)` })
      await expect(link).toHaveAttribute('aria-disabled', 'true')
      await expect(link).not.toHaveAttribute('href', /.*/)
    }

    // Keyboard order: skip link, logo, nav, search, cart, sign-in.
    const expected = [
      'Pular para o conteúdo',
      'KURIO',
      'Início',
      'Mercado (em breve)',
      'Criadores (em breve)',
      'Aprenda (em breve)',
      'Buscar (em breve)',
      'Carrinho',
      'Entrar',
    ]
    for (const name of expected) {
      await page.keyboard.press('Tab')
      const accessibleName = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null
        return el?.getAttribute('aria-label') ?? el?.textContent?.trim() ?? ''
      })
      expect(accessibleName.replace(/\s+/g, ' ')).toBe(name)
      expect(await hasVisibleFocusIndicator(page), `focus ring on ${name}`).toBe(true)
    }

    await expect(banner.getByRole('link', { name: 'Carrinho' })).toHaveAttribute('href', '/carrinho')
    await expect(banner.getByRole('link', { name: 'Entrar' })).toHaveAttribute('href', '/login')

    // Unavailable entries never navigate.
    await nav.getByRole('link', { name: 'Mercado (em breve)' }).click({ force: true })
    await expect(page).toHaveURL('/')

    const footer = page.getByRole('contentinfo')
    await expect(footer.getByRole('heading', { name: 'Antecipe-se ao próximo lançamento' })).toBeVisible()
    await expect(footer.getByRole('button', { name: 'Enviar' })).toHaveAttribute('aria-disabled', 'true')
    await expect(footer.getByRole('navigation', { name: 'Meu perfil' }).getByRole('link', { name: 'Meu perfil' })).toHaveAttribute('href', '/perfil')
    await expect(footer.getByRole('link', { name: 'Instagram (em breve)' })).toHaveAttribute('aria-disabled', 'true')
    await expect(footer.getByText('Carteiras compatíveis')).toBeVisible()

    await expectNoHorizontalOverflow(page)
    await saveScreenshot(page, testInfo, 'shell-home-desktop-1440')
  })

  test('switches to the desktop header at 768px without overflow', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 768, height: 1024 })
    await gotoReady(page, '/')
    await expect(page.getByRole('banner').getByRole('navigation', { name: 'Principal' })).toBeVisible()
    await expect(page.getByRole('search')).toBeHidden()
    await expectNoHorizontalOverflow(page)
    await saveScreenshot(page, testInfo, 'shell-home-tablet-768')
  })

  test('styles the not-found page inside the shell', async ({ page }, testInfo) => {
    await gotoReady(page, '/rota-inexistente')
    await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible()
    await expect(page.getByRole('banner')).toBeVisible()
    await saveScreenshot(page, testInfo, 'shell-not-found-desktop-1440')
  })
})

test.describe('mobile top bar and tab bar', () => {
  test.skip(({ isMobile }) => !isMobile, 'mobile layout only')

  test('tab bar exposes the five entries and is keyboard reachable', async ({ page }, testInfo) => {
    await gotoReady(page, '/')
    await expect(page.getByRole('banner').getByRole('navigation')).toBeHidden()
    const search = page.getByRole('search', { name: 'Explorar coleções' })
    await expect(search).toBeVisible()
    await expect(search.getByRole('searchbox')).toHaveAttribute('aria-disabled', 'true')
    await expect(page.getByRole('button', { name: 'Filtros (em breve)' })).toHaveAttribute('aria-disabled', 'true')

    const tabBar = page.getByRole('navigation', { name: 'Principal' })
    await expect(tabBar).toBeVisible()
    const box = await tabBar.boundingBox()
    const viewport = page.viewportSize()
    expect(box && viewport && Math.round(box.y + box.height)).toBe(viewport?.height)

    await expect(tabBar.getByRole('link', { name: 'Início' })).toHaveAttribute('aria-current', 'page')
    await expect(tabBar.getByRole('link', { name: 'Início' })).toHaveCSS('color', 'rgb(232, 155, 85)')
    await expect(tabBar.getByRole('link', { name: 'Favoritos' })).toHaveAttribute('href', '/favoritos')
    await expect(tabBar.getByRole('button', { name: 'Escanear (em breve)' })).toHaveAttribute('aria-disabled', 'true')
    await expect(tabBar.getByRole('link', { name: 'Carrinho' })).toHaveAttribute('href', '/carrinho')
    await expect(tabBar.getByRole('link', { name: 'Perfil' })).toHaveAttribute('href', '/perfil')

    const home = tabBar.getByRole('link', { name: 'Início' })
    await home.focus()
    await expect(home).toBeFocused()
    expect(await hasVisibleFocusIndicator(page)).toBe(true)

    // The fixed tab bar must not cover the end of the page.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    const copyright = page.getByText('Propriedade digital para todos.')
    const copyrightBox = await copyright.boundingBox()
    const barBox = await tabBar.boundingBox()
    expect(copyrightBox && barBox && copyrightBox.y + copyrightBox.height <= barBox.y).toBe(true)

    await expectNoHorizontalOverflow(page)
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    await saveScreenshot(page, testInfo, 'shell-home-mobile')
  })

  test('has no horizontal overflow at 390px', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await gotoReady(page, '/')
    await expectNoHorizontalOverflow(page)
    await saveScreenshot(page, testInfo, 'shell-home-mobile-390')
  })
})
