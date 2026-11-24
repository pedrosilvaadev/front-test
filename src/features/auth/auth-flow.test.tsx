import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { DEMO_CREDENTIALS } from '@/mocks/fixtures/users'
import { renderApp } from '@/test/render-app'
import { APP_READY_TIMEOUT, APP_TEST_TIMEOUT } from '@/test/timeouts'
import { SESSION_STORAGE_KEY } from './session-manager'

const READY = { timeout: APP_READY_TIMEOUT }
let disposers: (() => void)[] = []

function render(initialPath: string) {
  const app = renderApp({ initialPath })
  disposers.push(() => app.router.options.context.session.dispose())
  return app
}

afterEach(() => {
  for (const dispose of disposers) dispose()
  disposers = []
  window.localStorage.clear()
})

/** Minimal interaction helpers (no user-event dependency in this project). */
const user = {
  type: (element: HTMLElement, value: string) => {
    fireEvent.change(element, { target: { value: (element as HTMLInputElement).value + value } })
    return Promise.resolve()
  },
  clear: (element: HTMLElement) => {
    fireEvent.change(element, { target: { value: '' } })
    return Promise.resolve()
  },
  click: (element: HTMLElement) => {
    fireEvent.click(element)
    return Promise.resolve()
  },
  openMenu: (element: HTMLElement) => {
    element.focus()
    fireEvent.keyDown(element, { key: 'Enter' })
    return Promise.resolve()
  },
}

async function dialog() {
  return screen.findByRole('dialog', undefined, READY)
}

describe('auth flow (app integration)', { timeout: APP_TEST_TIMEOUT }, () => {
  it('guest on /perfil → login → back to /perfil with session data', async () => {
    const { router } = render('/perfil')

    const login = await dialog()
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(router.state.location.search).toEqual({ redirect: '/perfil' })
    expect(screen.queryByTestId('profile-summary')).not.toBeInTheDocument()

    await user.type(within(login).getByLabelText('E-mail'), DEMO_CREDENTIALS.collector.email)
    await user.type(within(login).getByLabelText('Senha'), DEMO_CREDENTIALS.collector.password)
    await user.click(within(login).getByRole('button', { name: 'Entrar' }))

    const profile = await screen.findByTestId('profile-summary', undefined, READY)
    expect(router.state.location.pathname).toBe('/perfil')
    expect(within(profile).getByTestId('profile-email')).toHaveTextContent(DEMO_CREDENTIALS.collector.email)
    expect(within(profile).getByTestId('profile-username')).toHaveTextContent('kurio.collector')
    expect(window.localStorage.getItem(SESSION_STORAGE_KEY)).not.toContain(DEMO_CREDENTIALS.collector.password)
  })

  it('validates client side in pt-BR and links errors to the fields', async () => {
    render('/login')
    const login = await dialog()

    await user.click(within(login).getByRole('button', { name: 'Entrar' }))

    const email = within(login).getByLabelText('E-mail')
    expect(email).toHaveAttribute('aria-invalid', 'true')
    expect(email).toHaveAccessibleDescription('Informe seu e-mail.')
    expect(within(login).getByLabelText('Senha')).toHaveAccessibleDescription('Informe sua senha.')
    expect(email).toHaveFocus()

    await user.type(email, 'colecionador@kurio.test')
    expect(email).not.toHaveAttribute('aria-invalid')
  })

  it('wrong password shows a form error and keeps the user on /login', async () => {
    const { router } = render('/login?redirect=/perfil')
    const login = await dialog()

    await user.type(within(login).getByLabelText('E-mail'), DEMO_CREDENTIALS.collector.email)
    await user.type(within(login).getByLabelText('Senha'), 'SenhaErrada1')
    await user.click(within(login).getByRole('button', { name: 'Entrar' }))

    expect(await within(login).findByRole('alert', undefined, READY)).toHaveTextContent('E-mail ou senha incorretos.')
    expect(router.state.location.pathname).toBe('/login')
    expect(window.localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull()
  })

  it('password toggle exposes its state with aria-pressed', async () => {
    render('/login')
    const login = await dialog()
    const password = within(login).getByLabelText('Senha')
    const toggle = within(login).getByRole('button', { name: 'Mostrar senha' })

    expect(password).toHaveAttribute('type', 'password')
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await user.click(toggle)
    expect(password).toHaveAttribute('type', 'text')
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
  })

  it('register maps USERNAME_TAKEN to the field; a valid account lands on the redirect signed in', async () => {
    const { router } = render('/cadastro?redirect=/perfil')
    const form = await dialog()

    const username = within(form).getByLabelText('Nome de usuário')
    await user.type(username, 'nova.sato')
    await user.type(within(form).getByLabelText('E-mail'), 'nova.conta@kurio.test')
    await user.type(within(form).getByLabelText('Senha'), 'Segredo2026')
    await user.type(within(form).getByLabelText('Confirmar senha'), 'Segredo2026')
    await user.click(within(form).getByRole('button', { name: /Criar (perfil|conta)/ }))

    await waitFor(() => expect(username).toHaveAccessibleDescription('Este nome de usuário já está em uso.'), READY)
    expect(username).toHaveFocus()

    await user.clear(username)
    await user.type(username, 'nova.conta')
    await user.click(within(form).getByRole('button', { name: /Criar (perfil|conta)/ }))

    const profile = await screen.findByTestId('profile-summary', undefined, READY)
    expect(router.state.location.pathname).toBe('/perfil')
    expect(within(profile).getByTestId('profile-display-name')).toHaveTextContent('nova.conta')
  })

  it('signed-in visitors skip /login; ?redirect=//evil.com is ignored', async () => {
    const { router } = render('/login?redirect=//evil.com')
    const login = await dialog()
    // The validated search drops the unsafe redirect (also over the raw root search).
    expect(router.state.matches.at(-1)?.search).toMatchObject({ redirect: undefined })

    await user.type(within(login).getByLabelText('E-mail'), DEMO_CREDENTIALS.creator.email)
    await user.type(within(login).getByLabelText('Senha'), DEMO_CREDENTIALS.creator.password)
    await user.click(within(login).getByRole('button', { name: 'Entrar' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/'), READY)

    await router.navigate({ to: '/login', search: { redirect: '/perfil' } })
    await waitFor(() => expect(router.state.location.pathname).toBe('/perfil'), READY)
  })

  it('header: Entrar for guests, account menu with logout when signed in', async () => {
    const { router } = render('/nft/emerald-ape-042')

    const entrar = await screen.findByRole('link', { name: 'Entrar' }, READY)
    expect(entrar).toHaveAttribute('href', '/login?redirect=%2Fnft%2Femerald-ape-042')
    await user.click(entrar)

    const login = await dialog()
    await user.type(within(login).getByLabelText('E-mail'), DEMO_CREDENTIALS.collector.email)
    await user.type(within(login).getByLabelText('Senha'), DEMO_CREDENTIALS.collector.password)
    await user.click(within(login).getByRole('button', { name: 'Entrar' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/nft/emerald-ape-042'), READY)

    const account = await screen.findByRole('button', { name: 'Conta de Kurio Collector' }, READY)
    await user.openMenu(account)
    await user.click(await screen.findByRole('menuitem', { name: 'Sair' }, READY))

    expect(await screen.findByRole('link', { name: 'Entrar' }, READY)).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/nft/emerald-ape-042')
    expect(window.localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull()
  })

  it('expired session: next private navigation goes to login with the notice and returns after re-login', async () => {
    const { router } = render('/login?redirect=/perfil')
    let login = await dialog()
    await user.type(within(login).getByLabelText('E-mail'), DEMO_CREDENTIALS.collector.email)
    await user.type(within(login).getByLabelText('Senha'), DEMO_CREDENTIALS.collector.password)
    await user.click(within(login).getByRole('button', { name: 'Entrar' }))
    await screen.findByTestId('profile-summary', undefined, READY)

    await router.navigate({ to: '/' })
    const expired = await fetch(new URL('/api/__dev/sessions/expire', window.location.origin), { method: 'POST' })
    expect(expired.status).toBe(200)
    await router.navigate({ to: '/perfil' })

    login = await dialog()
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'), READY)
    expect(router.state.location.search).toMatchObject({ redirect: '/perfil', reason: 'expired' })
    expect(within(login).getByText('Sua sessão expirou. Entre novamente para continuar.')).toHaveAttribute('role', 'alert')
    expect(window.localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull()

    await user.type(within(login).getByLabelText('E-mail'), DEMO_CREDENTIALS.collector.email)
    await user.type(within(login).getByLabelText('Senha'), DEMO_CREDENTIALS.collector.password)
    await user.click(within(login).getByRole('button', { name: 'Entrar' }))
    await screen.findByTestId('profile-summary', undefined, READY)
    expect(router.state.location.pathname).toBe('/perfil')
  })
})
