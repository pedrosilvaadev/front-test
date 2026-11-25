import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useCanGoBack, useNavigate, useRouter } from '@tanstack/react-router'
import { ChevronLeft, ShoppingCart } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { User } from '@/contracts'
import { useDocumentTitle, useSession, useSessionManager } from '@/features/auth/use-session'
import { useCart } from '@/features/cart/cart-queries'
import { queryKeys } from '@/lib/query-keys'
import { loadOrdersApi, walletsQueryOptions } from '../checkout-queries'
import { readAttempt } from '../checkout-storage'
import { recoverAttempt } from '../place-order'
import { CheckoutForm } from './checkout-form'

/**
 * `/checkout` (README §3 "Pagamento", Figma "Pagamento" desktop + mobile).
 * Private route (`_authed`): guests are sent to login and come back here.
 */
export function CheckoutPage() {
  useDocumentTitle('Pagamento')
  const session = useSession()
  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <CheckoutHeading />
      {session.status === 'authenticated' ? <CheckoutContent user={session.user} /> : <CheckoutSkeleton />}
    </div>
  )
}

/**
 * An emptied cart with a stored attempt that never got its order (lost
 * response, reload) means the purchase went through and was confirmed in the
 * background: replay the attempt with the same key and open its order
 * (README §3/§7 recovery, no second purchase). `true` while recovering.
 */
function useRecoverAttempt(userId: string, cartEmpty: boolean): boolean {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  // Key of the attempt whose recovery finished (success or nothing to recover).
  const [settledKey, setSettledKey] = useState<string | null>(null)
  const attempt = cartEmpty ? readAttempt(userId) : null
  const pendingKey = attempt && !attempt.orderId ? attempt.idempotencyKey : null
  useEffect(() => {
    if (!pendingKey) return
    let active = true
    void loadOrdersApi()
      .then((api) => recoverAttempt(userId, api))
      .then((order) => {
        if (!active || !order) return
        queryClient.setQueryData(queryKeys.user.order(userId, order.id), order)
        void navigate({ to: '/pedidos/$orderId', params: { orderId: order.id }, replace: true })
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setSettledKey(pendingKey)
      })
    return () => {
      active = false
    }
  }, [userId, pendingKey, navigate, queryClient])
  return pendingKey !== null && settledKey !== pendingKey
}

function CheckoutContent({ user }: { user: User }) {
  const cart = useCart()
  const manager = useSessionManager()
  const wallets = useQuery(walletsQueryOptions(user.id, manager))
  const recovering = useRecoverAttempt(user.id, cart.cart?.items.length === 0)

  if (recovering) return <CheckoutSkeleton label="Recuperando sua compra…" />
  if (cart.cart && cart.cart.items.length === 0) return <CheckoutEmpty />
  if (cart.cart && cart.owner.status === 'ready' && wallets.data) {
    return <CheckoutForm key={user.id} user={user} cart={cart.cart} owner={cart.owner.owner} wallets={wallets.data} />
  }
  if (cart.isError || wallets.isError) {
    return (
      <section role="alert" className="flex flex-col items-start gap-4 rounded-card bg-card p-6" data-testid="checkout-error">
        <p className="font-bold">Não foi possível carregar o pagamento.</p>
        <Button
          className="rounded-sm font-bold"
          onClick={() => {
            cart.refetch()
            void wallets.refetch()
          }}
        >
          Tentar novamente
        </Button>
      </section>
    )
  }
  return <CheckoutSkeleton />
}

function CheckoutHeading() {
  const canGoBack = useCanGoBack()
  const router = useRouter()
  const navigate = useNavigate()
  return (
    <>
      <nav aria-label="Trilha de navegação" className="hidden md:block">
        <ol className="flex items-center gap-1.5 text-sm font-bold tracking-[0.04em] text-foreground">
          <li>
            <Link to="/" className="rounded-sm outline-none hover:text-brand focus-visible:ring-2 focus-visible:ring-ring">
              Início
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>Mercado</li>
          <li aria-hidden="true">/</li>
          <li aria-current="page">Pagamento</li>
        </ol>
      </nav>
      <div className="relative flex items-center justify-center md:block">
        <button
          type="button"
          aria-label="Voltar"
          onClick={() => {
            if (canGoBack) router.history.back()
            else void navigate({ to: '/carrinho' })
          }}
          className="absolute left-0 inline-flex size-9 items-center justify-center rounded-full bg-card text-foreground outline-none hover:text-brand focus-visible:ring-2 focus-visible:ring-ring md:hidden"
        >
          <ChevronLeft className="size-5" aria-hidden="true" />
        </button>
        <h1 className="text-xl font-bold tracking-[0.04em] text-foreground md:sr-only">Pagamento com carteira</h1>
      </div>
    </>
  )
}

function CheckoutEmpty() {
  return (
    <section
      aria-labelledby="checkout-empty-title"
      data-testid="checkout-empty"
      className="flex flex-col items-center gap-4 rounded-card bg-card px-6 py-12 text-center"
    >
      <ShoppingCart className="size-10 text-brand" aria-hidden="true" />
      <h2 id="checkout-empty-title" className="text-xl font-bold tracking-[0.04em]">
        Seu carrinho está vazio
      </h2>
      <p className="max-w-prose text-muted-foreground">Adicione NFTs ao carrinho para finalizar uma compra.</p>
      <Button asChild className="rounded-sm font-bold">
        <Link to="/" hash="catalogo">
          Explorar NFTs
        </Link>
      </Button>
    </section>
  )
}

function CheckoutSkeleton({ label = 'Carregando pagamento…' }: { label?: string }) {
  return (
    <div aria-busy="true" aria-live="polite" data-testid="checkout-skeleton" className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_25.3rem]">
      <span className="sr-only">{label}</span>
      <Skeleton aria-hidden="true" className="h-[28rem] w-full bg-card" />
      <Skeleton aria-hidden="true" className="h-[28rem] w-full bg-card" />
    </div>
  )
}
