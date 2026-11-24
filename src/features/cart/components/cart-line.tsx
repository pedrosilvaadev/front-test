import { Link } from '@tanstack/react-router'
import { Minus, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import type { CartItem, QuoteLine } from '@/contracts'
import { formatEth } from '@/lib/money'
import { cn } from '@/lib/utils'
import { cartErrorMessage } from '../cart-errors'
import { useRemoveCartItem, useUpdateCartItem } from '../cart-queries'

const stepButtonClass = cn(
  'inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground outline-none transition-colors',
  'hover:bg-brand focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
  'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-primary',
)

interface CartLineProps {
  item: CartItem
  /** Priced line of the quote for the current cart version; `undefined` while it loads. */
  quoteLine: QuoteLine | undefined
}

/**
 * One cart line (Figma "Carrinho de NFTs"): art, name, token id, edition,
 * unit price, quantity stepper (1 … `nft.maxQuantity`), line total from the
 * quote (never computed on the client) and remove. Controls are disabled
 * while a change for this line is in flight; errors (e.g. 409
 * `AVAILABILITY_CONFLICT` with the allowed max) are shown inline.
 */
export function CartLine({ item, quoteLine }: CartLineProps) {
  const update = useUpdateCartItem()
  const remove = useRemoveCartItem()
  const [error, setError] = useState<string | null>(null)
  const busy = update.isPending || remove.isPending
  const { maxQuantity, available } = item.nft
  const exceeds = item.quantity > maxQuantity
  const nameId = `cart-line-${item.id}`

  function setQuantity(quantity: number) {
    if (busy || quantity < 1) return
    setError(null)
    update.mutate(
      { itemId: item.id, quantity },
      { onError: (cause) => setError(cartErrorMessage(cause)) },
    )
  }

  function handleRemove() {
    if (busy) return
    setError(null)
    remove.mutate({ itemId: item.id }, { onError: (cause) => setError(cartErrorMessage(cause)) })
  }

  const lineTotal = quoteLine ? (
    <span data-testid="cart-line-total">{formatEth(quoteLine.lineTotal)}</span>
  ) : (
    <Skeleton className="inline-block h-5 w-20 bg-accent align-middle" aria-label="Calculando total" />
  )

  return (
    <li
      data-testid="cart-line"
      data-item-id={item.id}
      aria-labelledby={nameId}
      aria-busy={busy || undefined}
      className="relative flex flex-col gap-2 rounded-2xl bg-card md:rounded-none"
    >
      <div className="grid grid-cols-[6.25rem_minmax(0,1fr)_auto] items-center gap-x-3 md:grid-cols-[minmax(0,1fr)_8.5rem_8.5rem_8.5rem_3rem] md:gap-x-0 md:pr-2">
        <div className="contents md:flex md:min-w-0 md:items-center md:gap-4">
          <img
            src={item.nft.image.url}
            alt=""
            width={item.nft.image.width}
            height={item.nft.image.height}
            loading="lazy"
            decoding="async"
            className="size-[6.25rem] rounded-l-2xl object-cover md:size-[4.375rem] md:rounded-none"
          />
          <div className="flex min-w-0 flex-col gap-0.5 py-3 md:py-0">
            <Link
              id={nameId}
              to="/nft/$idOrSlug"
              params={{ idOrSlug: item.nft.slug }}
              className="rounded-sm break-words text-[0.9375rem] font-bold md:truncate tracking-[0.04em] text-foreground outline-none hover:text-brand focus-visible:ring-2 focus-visible:ring-ring"
            >
              {item.nft.name}
            </Link>
            <p className="hidden text-[0.8125rem] tracking-[0.02em] text-subtle-foreground md:block">
              ID do token: {item.nft.tokenId}
            </p>
            <p className="text-[0.8125rem] tracking-[0.02em] text-subtle-foreground" data-testid="cart-line-edition">
              Edição: {item.nft.editionLabel}
            </p>
            <p className="mt-1 text-xl font-bold tracking-[0.04em] text-brand md:hidden">
              <span className="sr-only">Total do item: </span>
              {lineTotal}
            </p>
          </div>
        </div>

        <p className="hidden text-[0.9375rem] font-bold tracking-[0.04em] text-brand md:block" data-testid="cart-line-unit-price">
          <span className="sr-only">Preço unitário: </span>
          {formatEth(item.nft.unitPrice)}
        </p>

        <div className="flex flex-col items-end gap-2 pr-3 md:items-start md:pr-0">
          <div role="group" aria-label={`Quantidade de ${item.nft.name}`} className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Diminuir quantidade"
              disabled={busy || item.quantity <= 1}
              onClick={() => setQuantity(Math.min(item.quantity - 1, Math.max(maxQuantity, 1)))}
              className={stepButtonClass}
            >
              <Minus className="size-4" aria-hidden="true" strokeWidth={3} />
            </button>
            <output
              aria-live="polite"
              aria-label={`Quantidade: ${String(item.quantity)}`}
              data-testid="cart-line-quantity"
              className="min-w-4 text-center text-[0.9375rem] tabular-nums text-foreground"
            >
              {item.quantity}
            </output>
            <button
              type="button"
              aria-label="Aumentar quantidade"
              disabled={busy || item.quantity >= maxQuantity}
              onClick={() => setQuantity(item.quantity + 1)}
              className={stepButtonClass}
            >
              <Plus className="size-4" aria-hidden="true" strokeWidth={3} />
            </button>
          </div>
          <button
            type="button"
            onClick={handleRemove}
            disabled={busy}
            aria-label={`Remover ${item.nft.name} do carrinho`}
            className="inline-flex size-8 items-center justify-center rounded-sm text-brand outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 md:hidden"
          >
            <Trash2 className="size-5" aria-hidden="true" />
          </button>
        </div>

        <p className="hidden text-[0.9375rem] font-bold tracking-[0.04em] text-brand md:block">
          <span className="sr-only">Total do item: </span>
          {lineTotal}
        </p>

        <button
          type="button"
          onClick={handleRemove}
          disabled={busy}
          aria-label={`Remover ${item.nft.name} do carrinho`}
          className="hidden size-9 items-center justify-center rounded-sm text-brand outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 md:inline-flex"
        >
          <Trash2 className="size-5" aria-hidden="true" />
        </button>
      </div>

      {exceeds || error ? (
        <div className="px-4 pb-3 md:px-0 md:pb-2" aria-live="polite">
          {exceeds ? (
            <p className="text-[0.8125rem] text-destructive" data-testid="cart-line-availability">
              {available === 0
                ? 'Esgotado: remova este item para finalizar.'
                : `Apenas ${String(maxQuantity)} disponível(is) para esta edição. Reduza a quantidade.`}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="text-[0.8125rem] text-destructive" data-testid="cart-line-error">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}
