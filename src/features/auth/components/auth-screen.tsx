import { Link, useCanGoBack, useRouter } from '@tanstack/react-router'
import { XIcon } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { useSyncExternalStore } from 'react'
import type { AuthResponse } from '@/contracts'
import { CatalogSection } from '@/features/catalog/components/catalog-section'
import { FeaturedNftCard } from '@/features/home/components/featured-nft-card'
import { HeroCarousel } from '@/features/home/components/hero-carousel'
import { cn } from '@/lib/utils'
import { sanitizeRedirect, type AuthSearch } from '../redirect'
import { useDocumentTitle, useSessionManager } from '../use-session'
import { SocialSignIn } from './auth-form-parts'
import { LoginForm } from './login-form'
import { RegisterForm } from './register-form'

export type AuthMode = 'login' | 'register'

const DESKTOP_QUERY = '(min-width: 768px)'

function subscribeDesktop(onChange: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => {}
  const query = window.matchMedia(DESKTOP_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

function isDesktop(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(DESKTOP_QUERY).matches
}

const COPY = {
  login: {
    title: 'Entrar',
    description: 'Entre para gerenciar sua carteira, coleção e perfil de criador.',
  },
  register: {
    title: 'Criar perfil de colecionador',
    description: 'Crie seu perfil de colecionador e conecte uma carteira quando quiser.',
  },
} as const

const tabClass =
  'rounded-sm px-0.5 text-xl tracking-[0.06em] text-foreground outline-none hover:text-brand focus-visible:ring-2 focus-visible:ring-ring aria-[current=page]:text-brand'

/**
 * `/login` and `/cadastro` (Figma "Login"/"Cadastro"). Desktop: modal dialog
 * over the Início page with "Entrar | Criar conta" tabs; mobile: full-page
 * form with the KURIO wordmark. Radix Dialog provides the focus trap, Esc and
 * the inert background. Closing returns to the previous page (or `/`).
 * On success the session is stored and the user goes to the sanitized
 * `redirect` (default `/`).
 */
export function AuthScreen({ mode, search }: { mode: AuthMode; search: AuthSearch }) {
  const router = useRouter()
  const canGoBack = useCanGoBack()
  const session = useSessionManager()
  const desktop = useSyncExternalStore(subscribeDesktop, isDesktop, () => false)
  const copy = COPY[mode]
  useDocumentTitle(mode === 'login' ? 'Entrar' : 'Criar conta')

  // Sanitized again at the point of use (defense in depth; validateSearch already did).
  const target = sanitizeRedirect(search.redirect ?? '/')
  // Tabs keep the redirect target; the "expired" notice belongs to the login it came with.
  const tabSearch: AuthSearch = target === '/' ? {} : { redirect: target }

  function close() {
    if (canGoBack) router.history.back()
    else void router.navigate({ to: '/' })
  }

  function handleSuccess(response: AuthResponse) {
    session.signIn(response.session)
    void router.navigate({ href: target, replace: true })
  }

  return (
    <>
      {/* Desktop frame shows the dialog over Início; inert behind the modal. */}
      {desktop ? (
        <div className="flex flex-col gap-8 md:gap-20" data-testid="auth-backdrop">
          <HeroCarousel />
          <CatalogSection asideFooter={<FeaturedNftCard className="hidden lg:block" />} />
        </div>
      ) : null}
      <DialogPrimitive.Root open onOpenChange={(open) => (open ? undefined : close())}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content
            data-testid="auth-dialog"
            onOpenAutoFocus={(event) => {
              // Start on the first field (desktop) instead of the close button; on mobile
              // focus the screen itself so the on-screen keyboard does not pop up uninvited.
              event.preventDefault()
              const content = event.currentTarget as HTMLElement
              const target = desktop ? content.querySelector<HTMLElement>('input') : content
              target?.focus()
            }}
            className={cn(
              'fixed inset-0 z-50 flex flex-col overflow-y-auto bg-background px-7 pt-[6.5rem] pb-10 outline-none',
              'md:inset-auto md:top-1/2 md:left-1/2 md:max-h-[calc(100dvh-2rem)] md:w-[31.25rem] md:max-w-[calc(100%-2rem)] md:-translate-x-1/2 md:-translate-y-1/2',
              'md:border-b-[10px] md:border-primary md:bg-card md:px-0 md:pt-11 md:pb-[5.5rem] md:shadow-2xl',
              'data-[state=open]:animate-in data-[state=open]:fade-in-0',
            )}
          >
            <DialogPrimitive.Close className="absolute top-3 right-3 inline-flex size-9 items-center justify-center rounded-sm text-brand outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
              <XIcon className="size-5" aria-hidden="true" />
              <span className="sr-only">Fechar</span>
            </DialogPrimitive.Close>

            <div className="mx-auto flex w-full max-w-md flex-col md:max-w-none">
              <Link
                to="/"
                className="mx-auto mb-[5.5rem] rounded-sm text-[2rem] leading-none font-bold tracking-[0.12em] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
              >
                KURIO
              </Link>

              <DialogPrimitive.Title
                className={cn(
                  'mb-8 text-center font-bold tracking-[0.02em] md:sr-only',
                  // "Criar perfil de colecionador" fits one line at 390px only at 18px (Figma mobile).
                  mode === 'login' ? 'text-xl' : 'text-lg',
                )}
              >
                {copy.title}
              </DialogPrimitive.Title>

              <nav aria-label="Acesso à conta" className="hidden items-center justify-center gap-2 md:flex">
                <Link
                  to="/login"
                  search={tabSearch}
                  replace
                  aria-current={mode === 'login' ? 'page' : undefined}
                  className={tabClass}
                >
                  Entrar
                </Link>
                <span aria-hidden="true" className="h-6 w-px bg-primary" />
                <Link
                  to="/cadastro"
                  search={tabSearch}
                  replace
                  aria-current={mode === 'register' ? 'page' : undefined}
                  className={tabClass}
                >
                  Criar conta
                </Link>
              </nav>

              <DialogPrimitive.Description className="mx-auto max-w-[25rem] text-center text-xs leading-4 tracking-[0.04em] max-md:sr-only md:mt-11 md:mb-6">
                {copy.description}
              </DialogPrimitive.Description>

              <div className="flex flex-col gap-7 md:mx-auto md:w-[21.25rem] md:gap-8">
                {mode === 'login' ? (
                  <LoginForm
                    onSuccess={handleSuccess}
                    notice={search.reason === 'expired' ? 'Sua sessão expirou. Entre novamente para continuar.' : undefined}
                  />
                ) : (
                  <RegisterForm onSuccess={handleSuccess} />
                )}
                <SocialSignIn />
              </div>

              <p className="mt-12 text-center text-sm tracking-[0.02em] text-muted-foreground md:hidden">
                {mode === 'login' ? 'Novo na Kurio? ' : 'Já tem uma conta? '}
                <Link
                  to={mode === 'login' ? '/cadastro' : '/login'}
                  search={tabSearch}
                  replace
                  className="rounded-sm underline-offset-4 outline-none hover:text-brand hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {mode === 'login' ? 'Crie uma conta' : 'Entre'}
                </Link>
              </p>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  )
}
