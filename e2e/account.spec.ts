import type { Locator, Page } from '@playwright/test'
import { expect, gotoReady, pageFetch, test } from './fixtures'

/**
 * P3-02 account: favorites (optimistic + rollback, persistence, guest
 * redirect), collector profile (edit, avatar, password), wallets page and
 * user isolation. Desktop + mobile. Demo credentials are fictitious
 * (src/mocks/fixtures/users.ts).
 */

const READY = { timeout: 15_000 }
const COLLECTOR = { email: 'colecionador@kurio.test', password: 'Colecionador2026', displayName: 'Kurio Collector' }
const CREATOR = { email: 'nova@kurio.test', password: 'NovaSato2026', displayName: 'Nova Sato' }
const NFT = { slug: 'emerald-ape-042', id: 'nft_001', name: 'Emerald Ape #042' }
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

const json = (body: unknown, headers: Record<string, string> = {}, method = 'POST'): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json', ...headers },
  body: JSON.stringify(body),
})

async function apiLogin(page: Page, user: { email: string; password: string }) {
  return pageFetch(page, '/api/auth/login', json({ email: user.email, password: user.password }))
}

/** Signs in through the API and stores the session like the app does (skips the form). */
async function signInStored(page: Page, user = COLLECTOR): Promise<string> {
  const login = await apiLogin(page, user)
  expect(login.status, login.body).toBe(200)
  const { session } = JSON.parse(login.body) as { session: { token: string; expiresAt: string; user: { id: string } } }
  await page.evaluate(
    (value) => window.localStorage.setItem('kurio.session', value),
    JSON.stringify({ token: session.token, userId: session.user.id, expiresAt: session.expiresAt }),
  )
  return session.token
}

async function setScenario(page: Page, name: string) {
  const result = await pageFetch(page, '/api/__dev/scenario', json({ name }, {}, 'PUT'))
  expect(result.status, result.body).toBe(200)
}

function favoriteButton(page: Page, isMobile: boolean): Locator {
  return page.getByTestId(isMobile ? 'nft-favorite-mobile' : 'nft-favorite')
}

async function fillLogin(page: Page, email: string, password: string) {
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible(READY)
  await dialog.getByLabel('E-mail').fill(email)
  await dialog.getByLabel('Senha', { exact: true }).fill(password)
  await dialog.getByRole('button', { name: 'Entrar', exact: true }).click()
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
}

test.describe('account: favorites', () => {
  test('guest favorite goes to login and comes back', async ({ page, isMobile }) => {
    await gotoReady(page, `/nft/${NFT.slug}`)
    const heart = favoriteButton(page, isMobile)
    await expect(heart).toHaveAttribute('aria-pressed', 'false', READY)
    await heart.click()
    await expect(page).toHaveURL(new RegExp(`/login\\?redirect=%2Fnft%2F${NFT.slug}$`), READY)
    await fillLogin(page, COLLECTOR.email, COLLECTOR.password)
    await expect(page).toHaveURL(new RegExp(`/nft/${NFT.slug}$`), READY)
  })

  test('toggle is optimistic, persists across refresh and shows in Lista de interesse', async ({ page, isMobile }) => {
    await signInStored(page)
    await gotoReady(page, `/nft/${NFT.slug}`)
    const heart = favoriteButton(page, isMobile)
    await expect(heart).toHaveAttribute('data-state', 'off', READY)
    await expect(heart).toHaveAccessibleName(new RegExp(`Favoritar ${NFT.name}`))
    await heart.click()
    await expect(heart).toHaveAttribute('aria-pressed', 'true')

    await page.reload()
    await expect(favoriteButton(page, isMobile)).toHaveAttribute('aria-pressed', 'true', READY)

    await gotoReady(page, '/favoritos')
    const list = page.getByRole('list', { name: 'Favoritos' })
    await expect(list.getByRole('link', { name: NFT.name })).toBeVisible(READY)
    await expectNoHorizontalOverflow(page)

    // Unfavorite from the list (optimistic removal).
    await list.getByRole('button', { name: `Favoritar ${NFT.name}` }).click()
    await expect(page.getByTestId('favorites-empty')).toBeVisible(READY)
  })

  test('server error rolls the optimistic toggle back and announces it', async ({ page, isMobile }) => {
    await signInStored(page)
    await gotoReady(page, `/nft/${NFT.slug}`)
    const heart = favoriteButton(page, isMobile)
    await expect(heart).toHaveAttribute('data-state', 'off', READY)

    await setScenario(page, 'server-error')
    await heart.click()
    await expect(page.getByRole('alert').filter({ hasText: 'Não foi possível atualizar os favoritos' })).toHaveCount(1, READY)
    await expect(heart).toHaveAttribute('aria-pressed', 'false')
    await setScenario(page, 'default')

    await page.reload()
    await expect(favoriteButton(page, isMobile)).toHaveAttribute('data-state', 'off', READY)
  })
})

test.describe('account: profile', () => {
  test('edit profile, avatar and password; header updates; new password works', async ({ page, isMobile }) => {
    await signInStored(page)
    await gotoReady(page, '/perfil')
    const profile = page.getByTestId('profile-summary')
    await expect(profile.getByLabel('E-mail')).toHaveValue(COLLECTOR.email, READY)
    await expectNoHorizontalOverflow(page)

    // Required wallet nickname (null after seed) is enforced on save.
    await profile.getByRole('button', { name: 'Salvar' }).click()
    await expect(page.getByTestId('profile-status')).toHaveText('Corrija os campos destacados.')
    await expect(profile.getByLabel('Apelido da carteira')).toHaveAttribute('aria-invalid', 'true')

    await profile.getByLabel('Nome de exibição').fill('Colecionador Editado')
    await profile.getByLabel('Apelido da carteira').fill('Cofre principal')
    await profile.getByLabel('Nome ENS').fill('colecionador')
    await profile.getByRole('button', { name: 'Salvar' }).click()
    await expect(page.getByTestId('profile-status')).toHaveText('Perfil salvo.', READY)
    if (!isMobile) await expect(page.getByTestId('header-display-name')).toHaveText('Colecionador Editado')

    // Avatar: invalid type → error; PNG → preview/persisted image.
    const fileInput = profile.locator('input[type=file]')
    await fileInput.setInputFiles({ name: 'avatar.gif', mimeType: 'image/gif', buffer: PNG })
    await expect(page.getByTestId('avatar-error')).toHaveText('Use uma imagem PNG, JPEG ou WebP.')
    await fileInput.setInputFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: PNG })
    await expect(profile.getByRole('img', { name: 'Avatar atual' })).toBeVisible(READY)
    await expect(page.getByTestId('avatar-error')).toHaveText('')

    // Password: wrong current → field error; then success.
    await profile.getByLabel('Senha atual', { exact: true }).fill('SenhaErrada1')
    await profile.getByLabel('Nova senha', { exact: true }).fill('NovaSenha2027')
    await profile.getByLabel('Confirmar nova senha', { exact: true }).fill('NovaSenha2027')
    await profile.getByRole('button', { name: 'Salvar' }).click()
    await expect(profile.getByText('Senha atual incorreta.')).toBeVisible(READY)
    await expect(profile.getByLabel('Senha atual', { exact: true })).toHaveAttribute('aria-invalid', 'true')
    await profile.getByLabel('Senha atual', { exact: true }).fill(COLLECTOR.password)
    await profile.getByRole('button', { name: 'Salvar' }).click()
    await expect(page.getByTestId('profile-status')).toHaveText('Perfil salvo e senha alterada.', READY)

    await page.reload()
    await expect(page.getByTestId('profile-summary').getByLabel('Nome de exibição')).toHaveValue('Colecionador Editado', READY)
    await expect(page.getByTestId('profile-summary').getByRole('img', { name: 'Avatar atual' })).toBeVisible()

    expect((await apiLogin(page, COLLECTOR)).status).toBe(401)
    expect((await apiLogin(page, { email: COLLECTOR.email, password: 'NovaSenha2027' })).status).toBe(200)
  })
})

test.describe('account: wallets', () => {
  test('edit with invalid address shows the error; valid save drops and restores connection', async ({ page }) => {
    await signInStored(page)
    await gotoReady(page, '/carteiras')
    const primary = page.getByTestId('wallet-primary')
    await expect(primary.getByTestId('wallet-primary-status')).toBeVisible(READY)
    await expect(page.getByTestId('wallet-secondary')).toBeVisible()
    await expectNoHorizontalOverflow(page)

    await primary.getByRole('button', { name: 'Editar carteira principal' }).click()
    const address = primary.getByRole('textbox', { name: 'Endereço da carteira', exact: true })
    await address.fill('not-an-address')
    await primary.getByRole('button', { name: 'Salvar carteira' }).click()
    await expect(primary.getByText('Endereço inválido para a rede selecionada.')).toBeVisible()
    await expect(address).toHaveAttribute('aria-invalid', 'true')
    await expect(address).toBeFocused()

    await address.fill('0x52908400098527886E0F7030069857D2E4169EE7')
    await primary.getByRole('button', { name: 'Salvar carteira' }).click()
    await expect(primary.getByTestId('wallet-primary-status')).toHaveText('Desconectada', READY)
    await primary.getByRole('button', { name: 'Conectar' }).click()
    await expect(primary.getByTestId('wallet-primary-status')).toHaveText('Conectada', READY)

    await page.reload()
    await expect(page.getByTestId('wallet-primary-status')).toHaveText('Conectada', READY)
    await page.getByTestId('wallet-primary').getByRole('button', { name: 'Desconectar' }).click()
    await expect(page.getByTestId('wallet-primary-status')).toHaveText('Desconectada', READY)
  })
})

test.describe('account: isolation', () => {
  test('switching users never shows the previous user favorites/profile', async ({ page, isMobile }) => {
    const token = await signInStored(page)
    const fav = await pageFetch(page, `/api/favorites/${NFT.id}`, { method: 'PUT', headers: { Authorization: `Bearer ${token}` } })
    expect(fav.status, fav.body).toBe(200)

    await gotoReady(page, '/favoritos')
    await expect(page.getByRole('list', { name: 'Favoritos' }).getByRole('link', { name: NFT.name })).toBeVisible(READY)
    await page.getByTestId('favorites-page').getByRole('button', { name: 'Sair' }).click()
    await expect(page).toHaveURL(/\/$/, READY)

    // Client-side from here: the in-memory cache must not leak the collector's data.
    if (isMobile) {
      await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Favoritos' }).click()
      await expect(page).toHaveURL(/\/login\?redirect=%2Ffavoritos$/, READY)
      await fillLogin(page, CREATOR.email, CREATOR.password)
      await expect(page).toHaveURL(/\/favoritos$/, READY)
    } else {
      await page.getByRole('banner').getByRole('link', { name: 'Entrar' }).click()
      await fillLogin(page, CREATOR.email, CREATOR.password)
      await expect(page.getByTestId('header-display-name')).toHaveText(CREATOR.displayName, READY)
      await page.getByRole('button', { name: `Conta de ${CREATOR.displayName}` }).click()
      await page.getByRole('menuitem', { name: 'Perfil' }).click()
      await expect(page.getByTestId('profile-summary').getByLabel('E-mail')).toHaveValue(CREATOR.email, READY)
      await page.getByRole('navigation', { name: 'Menu da conta' }).getByRole('link', { name: 'Lista de interesse' }).click()
    }
    await expect(page.getByTestId('favorites-empty')).toBeVisible(READY)
    await expect(page.getByText(NFT.name)).toHaveCount(0)
    await expect(page.getByText(COLLECTOR.email)).toHaveCount(0)
  })
})
