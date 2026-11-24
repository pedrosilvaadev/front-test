import { Link, useCanGoBack, useNavigate, useRouter } from '@tanstack/react-router'
import { AlertTriangle, ChevronLeft, ShoppingCart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { Cart } from '@/contracts'
import { useDocumentTitle } from '@/features/auth/use-session'
import { useCart, useCartQuote, type CartOwner } from '../cart-queries'
import { CartLine } from './cart-line'
import { CartSummary } from './cart-summary'

/**
 * `/carrinho` (README §3 "Carrinho", Figma "Carrinho de NFTs" desktop +
 * mobile). Guest or user cart (ADR-006). States: skeleton while the session /
 * cart load, retryable error, empty cart with a link to the catalog, and the
 * lines + quote summary.
 */
export function CartPage() {
  useDocumentTitle('Carrinho')
  const state = useCart()
  const { owner, cart } = state

  let content: React.ReactNode
  if (owner.status === 'none' || (cart && cart.items.length === 0)) {
    content = <CartEmpty />
  } else if (cart && owner.status === 'ready') {
    content = <CartContent cart={cart} owner={owner.owner} />
  } else if (state.isError) {
    content = <CartError onRetry={state.refetch} retrying={state.isFetching} />
  } else {
    content = <CartSkeleton />
  }

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <CartHeading />
      {content}
    </div>
  )
}

function CartHeading() {
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
          <li aria-current="page">Carrinho</li>
        </ol>
      </nav>
      <div className="relative flex items-center justify-center md:block">
        <button
          type="button"
          aria-label="Voltar"
          onClick={() => {
            if (canGoBack) router.history.back()
            else void navigate({ to: '/' })
          }}
          className="absolute left-0 inline-flex size-9 md:hidden items-center justify-center rounded-full bg-card text-foreground outline-none hover:text-brand focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronLeft className="size-5" aria-hidden="true" />
        </button>
        <h1 className="text-xl font-bold tracking-[0.04em] text-foreground md:sr-only">Carrinho de NFTs</h1>
      </div>
    </>
  )
}

function CartContent({ cart, owner }: { cart: Cart; owner: CartOwner }) {
  const quote = useCartQuote(owner, cart.version)
  // Only a quote for this exact cart version prices the lines shown.
  const current = quote.data?.cartVersion === cart.version ? quote.data : undefined

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20.75rem] lg:gap-[5.375rem]">
      <section aria-labelledby="cart-items-title" className="flex min-w-0 flex-col gap-3">
        <h2 id="cart-items-title" className="sr-only">
          Itens do carrinho ({cart.itemCount} {cart.itemCount === 1 ? 'unidade' : 'unidades'})
        </h2>
        <div
          aria-hidden="true"
          className="hidden grid-cols-[minmax(0,1fr)_8.5rem_8.5rem_8.5rem_3rem] border-b border-border pb-2 text-[0.9375rem] font-bold tracking-[0.04em] text-foreground md:grid"
        >
          <span>NFTs</span>
          <span>Preço</span>
          <span>Edições</span>
          <span>Total</span>
          <span />
        </div>
        <ul className="flex flex-col gap-4 md:gap-3" data-testid="cart-lines">
          {cart.items.map((item) => (
            <CartLine
              key={item.id}
              item={item}
              quoteLine={current?.lines.find((line) => line.cartItemId === item.id)}
            />
          ))}
        </ul>
      </section>
      <CartSummary
        cart={cart}
        quote={current}
        quoteError={quote.isError}
        onRetryQuote={() => void quote.refetch()}
      />
    </div>
  )
}

function CartEmpty() {
  return (
    <section
      aria-labelledby="cart-empty-title"
      data-testid="cart-empty"
      className="flex flex-col items-center gap-4 rounded-card bg-card px-6 py-12 text-center"
    >
      <ShoppingCart className="size-10 text-brand" aria-hidden="true" />
      <h2 id="cart-empty-title" className="text-xl font-bold tracking-[0.04em]">
        Seu carrinho está vazio
      </h2>
      <p className="max-w-prose text-muted-foreground">Explore o catálogo e adicione NFTs para vê-los aqui.</p>
      <Button asChild className="rounded-sm font-bold">
        <Link to="/" hash="catalogo">
          Explorar NFTs
        </Link>
      </Button>
    </section>
  )
}

function CartError({ onRetry, retrying }: { onRetry: () => void; retrying: boolean }) {
  return (
    <section role="alert" data-testid="cart-error" className="flex flex-col items-start gap-4 rounded-card bg-card p-6">
      <p className="flex items-center gap-2 font-bold text-foreground">
        <AlertTriangle className="size-5 text-brand" aria-hidden="true" />
        Não foi possível carregar o carrinho.
      </p>
      <Button onClick={onRetry} disabled={retrying} className="rounded-sm font-bold">
        {retrying ? 'Tentando…' : 'Tentar novamente'}
      </Button>
    </section>
  )
}

function CartSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite" data-testid="cart-skeleton" className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20.75rem] lg:gap-[5.375rem]">
      <span className="sr-only">Carregando carrinho…</span>
      <div className="flex flex-col gap-3" aria-hidden="true">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-[6.25rem] w-full rounded-2xl bg-card md:h-[4.375rem] md:rounded-none" />
        ))}
      </div>
      <Skeleton className="h-72 w-full bg-card" aria-hidden="true" />
    </div>
  )
}
