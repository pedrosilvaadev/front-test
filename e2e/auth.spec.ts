import type { Locator, Page } from '@playwright/test'
import { expect, gotoReady, pageFetch, test } from './fixtures'

/**
 * P3-01 auth: register/login/logout, session survives reload, protected
 * `/perfil`, forced expiry → login with notice → back, user switch isolation
 * and open-redirect protection. Runs on desktop (dialog over Início) and
 * mobile (full-page form). Demo credentials are fictitious (src/mocks/fixtures/users.ts).
 */

const READY = { timeout: 15_000 }
const SESSION_KEY = 'kurio.session'
const COLLECTOR = {
  email: 'colecionador@kurio.test',
  password: 'Colecionador2026',
  displayName: 'Kurio Collector',
  username: 'kurio.collector',
}
const CREATOR = { email: 'nova@kurio.test', password: 'NovaSato2026', displayName: 'Nova Sato', username: 'nova.sato' }

function authDialog(page: Page): Locator {
  return page.getByRole('dialog')
}

async function fillLogin(page: Page, email: string, password: string): Promise<void> {
  const dialog = authDialog(page)
  await expect(dialog).toBeVisible(READY)
  await dialog.getByLabel('E-mail').fill(email)
  await dialog.getByLabel('Senha', { exact: true }).fill(password)
  await dialog.getByRole('button', { name: 'Entrar', exact: true }).click()
}

async function expectProfile(page: Page, user: { email: string; username: string; displayName: string }) {
  await expect(page).toHaveURL(/\/perfil$/, READY)
  const profile = page.getByTestId('profile-summary')
  await expect(profile).toBeVisible(READY)
  await expect(profile.getByTestId('profile-email')).toHaveText(user.email)
  await expect(profile.getByTestId('profile-username')).toHaveText(user.username)
  await expect(profile.getByTestId('profile-display-name')).toHaveText(user.displayName)
}

async function storedSession(page: Page): Promise<string | null> {
  return page.evaluate((key) => window.localStorage.getItem(key), SESSION_KEY)
}

/** Client-side navigation to `/perfil` (no reload): account menu on desktop, tab bar on mobile. */
async function openProfileFromChrome(page: Page, isMobile: boolean, displayName: string): Promise<void> {
  if (isMobile) {
    await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Perfil' }).click()
    return
  }
  await page.getByRole('button', { name: `Conta de ${displayName}` }).click()
  await page.getByRole('menuitem', { name: 'Perfil' }).click()
}

/** Client-side navigation home (keeps the page realm and its in-memory query cache). */
async function goHomeFromChrome(page: Page, isMobile: boolean): Promise<void> {
  if (isMobile) await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Início' }).click()
  else await page.getByRole('banner').getByRole('link', { name: 'KURIO' }).click()
  await expect(page).toHaveURL(/\/$/, READY)
}

async function logoutFromProfile(page: Page): Promise<void> {
  await page.getByTestId('profile-summary').getByRole('button', { name: 'Sair' }).click()
  await expect(page).toHaveURL(/\/$/, READY)
}

test.describe('auth: login and register', () => {
  test('register lands on the redirect target signed in', async ({ page }) => {
    await gotoReady(page, '/cadastro?redirect=/perfil')
    const dialog = authDialog(page)
    await expect(dialog).toBeVisible(READY)
    await dialog.getByLabel('Nome de usuário').fill('Nova.Conta')
    await dialog.getByLabel('E-mail').fill('nova.conta@kurio.test')
    await dialog.getByLabel('Senha', { exact: true }).fill('Segredo2026')
    await dialog.getByLabel('Confirmar senha').fill('Segredo2026')
    await dialog.getByRole('button', { name: /^Criar (perfil|conta)$/ }).click()

    await expectProfile(page, { email: 'nova.conta@kurio.test', username: 'nova.conta', displayName: 'nova.conta' })
    const stored = await storedSession(page)
    expect(stored).not.toBeNull()
    expect(stored).not.toContain('Segredo2026')
  })

  test('register shows field errors (client validation and taken e-mail)', async ({ page }) => {
    await gotoReady(page, '/cadastro')
    const dialog = authDialog(page)
    await expect(dialog).toBeVisible(READY)
    await dialog.getByRole('button', { name: /^Criar (perfil|conta)$/ }).click()
    const username = dialog.getByLabel('Nome de usuário')
    await expect(username).toHaveAttribute('aria-invalid', 'true')
    await expect(username).toBeFocused()
    await expect(username).toHaveAccessibleDescription('Informe um nome de usuário.')

    await username.fill('outra.conta')
    await dialog.getByLabel('E-mail').fill(COLLECTOR.email)
    await dialog.getByLabel('Senha', { exact: true }).fill('Segredo2026')
    await dialog.getByLabel('Confirmar senha').fill('Segredo2027')
    await expect(dialog.getByLabel('Confirmar senha')).toHaveAccessibleDescription('As senhas não coincidem.')
    await dialog.getByLabel('Confirmar senha').fill('Segredo2026')
    await dialog.getByRole('button', { name: /^Criar (perfil|conta)$/ }).click()
    await expect(dialog.getByLabel('E-mail')).toHaveAccessibleDescription('Este e-mail já está cadastrado.', READY)
    await expect(page).toHaveURL(/\/cadastro$/)
  })

  test('wrong password shows an error and stays on login', async ({ page }) => {
    await gotoReady(page, '/login')
    await fillLogin(page, COLLECTOR.email, 'SenhaErrada1')
    await expect(authDialog(page).getByRole('alert')).toHaveText('E-mail ou senha incorretos.', READY)
    await expect(page).toHaveURL(/\/login$/)
    expect(await storedSession(page)).toBeNull()

    // Show/hide toggle is labelled and exposes its state.
    const toggle = authDialog(page).getByRole('button', { name: 'Mostrar senha' })
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await expect(authDialog(page).getByLabel('Senha', { exact: true })).toHaveAttribute('type', 'text')
  })

  test('login survives a reload; signed-in visitors skip /login', async ({ page }) => {
    await gotoReady(page, '/login?redirect=/perfil')
    await fillLogin(page, COLLECTOR.email, COLLECTOR.password)
    await expectProfile(page, COLLECTOR)

    const revalidated = page.waitForResponse((r) => r.url().endsWith('/api/auth/session') && r.status() === 200)
    await page.reload()
    await revalidated
    await expectProfile(page, COLLECTOR)

    await gotoReady(page, '/login?redirect=/perfil')
    await expect(page).toHaveURL(/\/perfil$/, READY)
  })

  test('?redirect=//evil.com is ignored (open redirect)', async ({ page, baseURL }) => {
    await gotoReady(page, '/login?redirect=//evil.com')
    await fillLogin(page, COLLECTOR.email, COLLECTOR.password)
    await expect(page).toHaveURL(`${baseURL ?? ''}/`, READY)
  })

  test('?redirect=/.//evil.com (dot-segment normalization) is ignored', async ({ page, baseURL }) => {
    await gotoReady(page, '/login?redirect=/.//evil.com')
    await fillLogin(page, COLLECTOR.email, COLLECTOR.password)
    await expect(page).toHaveURL(`${baseURL ?? ''}/`, READY)
    // Signed in: the auth-page guard must not throw on the same param either.
    await gotoReady(page, '/login?redirect=/a/..//evil.com')
    await expect(page).toHaveURL(`${baseURL ?? ''}/`, READY)
  })

  test('closing the dialog returns to the previous page', async ({ page, isMobile }) => {
    await gotoReady(page, '/nft/emerald-ape-042')
    await expect(page.getByRole('heading', { level: 1, name: 'Emerald Ape #042' })).toBeVisible(READY)
    if (isMobile) {
      // Mobile: profile tab → guard → login.
      await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Perfil' }).click()
      await expect(page).toHaveURL(/\/login\?redirect=%2Fperfil$/, READY)
    } else {
      const entrar = page.getByRole('banner').getByRole('link', { name: 'Entrar' })
      await expect(entrar).toHaveAttribute('href', '/login?redirect=%2Fnft%2Femerald-ape-042')
      await entrar.click()
      await expect(page).toHaveURL(/\/login\?redirect=%2Fnft%2Femerald-ape-042$/, READY)
    }
    await expect(authDialog(page)).toBeVisible(READY)
    await page.keyboard.press('Escape')
    await expect(page).toHaveURL(/\/nft\/emerald-ape-042$/, READY)
  })
})

test.describe('auth: protected routes, logout, expiry, isolation', () => {
  test('guest on /perfil → login → back to /perfil', async ({ page }) => {
    await gotoReady(page, '/perfil')
    await expect(page).toHaveURL(/\/login\?redirect=%2Fperfil$/, READY)
    await expect(page.getByTestId('profile-summary')).toHaveCount(0)
    await fillLogin(page, CREATOR.email, CREATOR.password)
    await expectProfile(page, CREATOR)
  })

  test('logout clears the session and /perfil redirects again', async ({ page }) => {
    await gotoReady(page, '/login?redirect=/perfil')
    await fillLogin(page, COLLECTOR.email, COLLECTOR.password)
    await expectProfile(page, COLLECTOR)

    await logoutFromProfile(page)
    expect(await storedSession(page)).toBeNull()

    await gotoReady(page, '/perfil')
    await expect(page).toHaveURL(/\/login\?redirect=%2Fperfil$/, READY)
  })

  test('forced expiry → next private navigation goes to login with notice → back after re-login', async ({
    page,
    isMobile,
  }) => {
    await gotoReady(page, '/login?redirect=/perfil')
    await fillLogin(page, COLLECTOR.email, COLLECTOR.password)
    await expectProfile(page, COLLECTOR)
    await goHomeFromChrome(page, isMobile)

    const expired = await pageFetch(page, '/api/__dev/sessions/expire', { method: 'POST' })
    expect(expired.status).toBe(200)
    expect(JSON.parse(expired.body)).toEqual({ expired: 1 })

    await openProfileFromChrome(page, isMobile, COLLECTOR.displayName)
    await expect(page).toHaveURL(/\/login\?redirect=%2Fperfil&reason=expired$/, READY)
    await expect(authDialog(page).getByRole('alert')).toHaveText('Sua sessão expirou. Entre novamente para continuar.')
    expect(await storedSession(page)).toBeNull()

    await fillLogin(page, COLLECTOR.email, COLLECTOR.password)
    await expectProfile(page, COLLECTOR)
  })

  test('switching demo users never shows the previous user data', async ({ page, isMobile }) => {
    await gotoReady(page, '/login?redirect=/perfil')
    await fillLogin(page, COLLECTOR.email, COLLECTOR.password)
    await expectProfile(page, COLLECTOR)
    if (!isMobile) await expect(page.getByTestId('header-display-name')).toHaveText(COLLECTOR.displayName)
    await logoutFromProfile(page)

    if (isMobile) {
      await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Perfil' }).click()
    } else {
      await page.getByRole('banner').getByRole('link', { name: 'Entrar' }).click()
    }
    await fillLogin(page, CREATOR.email, CREATOR.password)
    if (!isMobile) {
      await expect(page.getByTestId('header-display-name')).toHaveText(CREATOR.displayName, READY)
      await openProfileFromChrome(page, isMobile, CREATOR.displayName)
    }
    await expectProfile(page, CREATOR)
    await expect(page.getByText(COLLECTOR.email)).toHaveCount(0)
    await expect(page.getByText(COLLECTOR.displayName)).toHaveCount(0)
  })
})
