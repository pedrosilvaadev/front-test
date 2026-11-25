import { Link } from '@tanstack/react-router'
import { AlertTriangle, X } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import type { Cart, Quote } from '@/contracts'
import { formatEth } from '@/lib/money'
import { cn } from '@/lib/utils'
import { cartErrorMessage, quoteChangeMessage } from '../cart-errors'
import { useApplyCoupon, useRemoveCoupon } from '../cart-queries'

const MAX_COUPON_LENGTH = 32

/** "Código promocional": apply (normalized server side) or remove the cart coupon. */
function CouponForm({ cart }: { cart: Cart }) {
  const apply = useApplyCoupon()
  const remove = useRemoveCoupon()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const inputId = useId()
  const errorId = useId()
  const busy = apply.isPending || remove.isPending

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const trimmed = code.trim()
    if (trimmed === '' || trimmed.length > MAX_COUPON_LENGTH) {
      setError('Digite um código promocional válido.')
      return
    }
    setError(null)
    apply.mutate(
      { code: trimmed },
      {
        onSuccess: () => setCode(''),
        onError: (cause) => setError(cartErrorMessage(cause)),
      },
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-2" aria-label="Código promocional">
        <label htmlFor={inputId} className="sr-only text-sm font-bold tracking-[0.04em] text-foreground md:not-sr-only">
          Código promocional
        </label>
        <div className="flex h-12 overflow-hidden rounded-full border border-border bg-background focus-within:ring-2 focus-within:ring-ring md:h-10 md:rounded-sm md:border-primary">
          <input
            id={inputId}
            name="coupon"
            value={code}
            maxLength={64}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="Digite o código promocional..."
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            onChange={(event) => {
              setCode(event.target.value)
              if (error) setError(null)
            }}
            className="min-w-0 flex-1 bg-transparent px-4 text-[0.8125rem] tracking-[0.02em] text-foreground outline-none placeholder:text-subtle-foreground"
          />
          <button
            type="submit"
            disabled={busy}
            className="shrink-0 rounded-full bg-linear-to-r from-primary to-[#a66d3c] px-5 text-[0.9375rem] font-bold tracking-[0.04em] text-primary-foreground outline-none disabled:opacity-60 md:rounded-none md:bg-primary md:bg-none"
          >
            Aplicar
          </button>
        </div>
        {error ? (
          <p id={errorId} role="alert" className="text-[0.8125rem] text-destructive" data-testid="coupon-error">
            {error}
          </p>
        ) : null}
      </form>
      {cart.coupon ? (
        <div className="flex items-center justify-between gap-2 rounded-sm border border-border-accent px-3 py-2" data-testid="applied-coupon">
          <p className="text-[0.8125rem] text-foreground">
            Cupom <strong>{cart.coupon.code}</strong>: {cart.coupon.label}
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setError(null)
              remove.mutate(undefined, { onError: (cause) => setError(cartErrorMessage(cause)) })
            }}
            aria-label={`Remover cupom ${cart.coupon.code}`}
            className="inline-flex size-7 items-center justify-center rounded-sm text-muted-foreground outline-none hover:text-brand focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </div>
  )
}

interface SummaryRowProps {
  label: string
  value: React.ReactNode
  testId: string
  emphasis?: boolean
  /** Small right-aligned line under the value (second `dd` of the same term: valid `dl` structure). */
  note?: string
}

function SummaryRow({ label, value, testId, emphasis = false, note }: SummaryRowProps) {
  return (
    <div className={cn('flex flex-wrap items-baseline justify-between gap-x-2', emphasis ? 'pt-3' : '')}>
      <dt className={cn('whitespace-nowrap tracking-[0.04em]', emphasis ? 'font-bold text-foreground' : 'text-foreground')}>{label}</dt>
      <dd
        data-testid={testId}
        className={cn('text-right whitespace-nowrap tabular-nums', emphasis ? 'text-lg font-bold text-brand' : 'text-foreground')}
      >
        {value}
      </dd>
      {note ? <dd className="basis-full text-right text-[0.6875rem] tracking-[0.02em] text-brand">{note}</dd> : null}
    </div>
  )
}

interface CartSummaryProps {
  cart: Cart
  /** Quote for the current cart version (`undefined` while loading). */
  quote: Quote | undefined
  quoteError: boolean
  onRetryQuote: () => void
}

/**
 * "Resumo da carteira" (Figma): coupon, subtotal, discount, network fee and
 * total — all from the quote (the API is the reference; nothing is summed
 * on the client). Changes reported by the quote are listed for the user.
 */
export function CartSummary({ cart, quote, quoteError, onRetryQuote }: CartSummaryProps) {
  const loading = <Skeleton className="ml-auto h-5 w-24 bg-accent" aria-hidden="true" />
  const value = (render: (q: Quote) => string) => (quote ? render(quote) : loading)

  return (
    <section
      aria-labelledby="cart-summary-title"
      data-testid="cart-summary"
      className="-mx-6 flex flex-col gap-4 rounded-t-[2rem] bg-card px-6 pt-6 pb-6 md:mx-0 md:rounded-none md:bg-transparent md:p-0"
    >
      <h2 id="cart-summary-title" className="sr-only border-b border-border pb-3 text-lg font-bold tracking-[0.04em] text-foreground md:not-sr-only">
        Resumo da carteira
      </h2>
      <CouponForm cart={cart} />

      {quote && quote.changes.length > 0 ? (
        <div role="status" className="flex gap-2 rounded-sm border border-border-accent p-3 text-[0.8125rem] text-foreground" data-testid="quote-changes">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />
          <ul className="flex flex-col gap-1">
            {quote.changes.map((change, index) => (
              <li key={`${change.type}-${String(index)}`}>{quoteChangeMessage(change, quote)}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {quoteError && !quote ? (
        <div role="alert" className="flex flex-col items-start gap-2 text-[0.8125rem] text-destructive" data-testid="quote-error">
          <p>Não foi possível calcular os valores do carrinho.</p>
          <button
            type="button"
            onClick={onRetryQuote}
            className="rounded-sm font-bold text-brand underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            Tentar novamente
          </button>
        </div>
      ) : (
        <dl className="flex flex-col gap-2 text-[0.9375rem] lg:text-sm" aria-busy={!quote || undefined}>
          <SummaryRow label="Subtotal" testId="cart-subtotal" value={value((q) => formatEth(q.subtotal))} />
          <SummaryRow label="Desconto do lançamento" testId="cart-discount" value={value((q) => `(-) ${formatEth(q.discount)}`)} />
          <SummaryRow label="Taxa de rede" testId="cart-fee" note="Taxa estimada" value={value((q) => formatEth(q.networkFee))} />
          <SummaryRow label="Total" testId="cart-total" emphasis value={value((q) => formatEth(q.total))} />
        </dl>
      )}

      {quote && !quote.purchasable ? (
        <p className="text-[0.8125rem] text-destructive" data-testid="cart-not-purchasable">
          Ajuste os itens indisponíveis para finalizar a compra.
        </p>
      ) : null}

      {/* P4-02: private checkout (guests go through login and come back; the guest cart is merged). */}
      {quote?.purchasable ? (
        <Link
          to="/checkout"
          data-testid="cart-checkout"
          className="mt-2 inline-flex h-14 w-full items-center justify-center rounded-full bg-linear-to-r from-primary to-[#a66d3c] text-[0.9375rem] font-bold tracking-[0.04em] text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background md:h-10 md:rounded-sm md:bg-primary md:bg-none"
        >
          Conectar e finalizar
        </Link>
      ) : (
        <button
          type="button"
          disabled
          data-testid="cart-checkout"
          className="mt-2 h-14 w-full cursor-not-allowed rounded-full bg-primary text-[0.9375rem] font-bold tracking-[0.04em] text-primary-foreground opacity-50 md:h-10 md:rounded-sm"
        >
          Conectar e finalizar
        </button>
      )}
      <Link
        to="/"
        className="hidden self-center rounded-sm text-[0.9375rem] tracking-[0.04em] text-brand outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring md:inline"
      >
        Continuar explorando
      </Link>
    </section>
  )
}
