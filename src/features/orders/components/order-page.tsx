import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { AlertTriangle, Loader2, MailOpen, X } from 'lucide-react'
import { useEffect } from 'react'
import { isApiError } from '@/api/errors'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { Network, Order, User } from '@/contracts'
import { useDocumentTitle, useSession } from '@/features/auth/use-session'
import { PROVIDER_LABELS } from '@/features/checkout/checkout-form'
import { orderQueryOptions } from '@/features/checkout/checkout-queries'
import { clearAttempt, readAttempt } from '@/features/checkout/checkout-storage'
import { formatEth, isZeroEth } from '@/lib/money'
import { queryKeys } from '@/lib/query-keys'
import { formatOrderDate, shortHash } from '../format'

const EXPLORER_NAMES: Record<Network, string> = { ethereum: 'Etherscan', polygon: 'Polygonscan', solana: 'Solscan' }
const NETWORK_NAMES: Record<Network, string> = { ethereum: 'Ethereum', polygon: 'Polygon', solana: 'Solana' }
/**
 * `/pedidos/$orderId` (README §3 "Confirmação", Figma "Confirmação de
 * Pedido"). Rendered only from the order payload (immutable receipt), never
 * from the catalog. Pending orders are polled with backoff; the receipt is
 * shown only for `confirmed`; `declined` offers a new attempt.
 */
export function OrderPage({ orderId }: { orderId: string }) {
  const session = useSession()
  useDocumentTitle('Pedido')
  if (session.status !== 'authenticated') return <OrderSkeleton />
  return <OrderContent user={session.user} orderId={orderId} />
}

function OrderContent({ user, orderId }: { user: User; orderId: string }) {
  const queryClient = useQueryClient()
  const query = useQuery(orderQueryOptions(user.id, orderId))
  const order = query.data
  const status = order?.status

  // Terminal: the attempt is finished (ADR-004); cart and catalog changed server side.
  useEffect(() => {
    if (!status || status === 'pending') return
    if (readAttempt(user.id)?.orderId === orderId) clearAttempt(user.id)
    void queryClient.invalidateQueries({ queryKey: queryKeys.cart.all })
    void queryClient.invalidateQueries({ queryKey: queryKeys.catalog.all })
  }, [status, user.id, orderId, queryClient])

  if (order) {
    return (
      <div className="flex justify-center" data-testid="order-page" data-status={order.status}>
        <p className="sr-only" aria-live="polite" role="status">
          {order.status === 'pending'
            ? 'Pagamento em processamento.'
            : order.status === 'confirmed'
              ? 'Compra confirmada.'
              : 'Pagamento recusado.'}
        </p>
        {order.status === 'confirmed' ? <Receipt order={order} /> : null}
        {order.status === 'pending' ? <PendingOrder order={order} /> : null}
        {order.status === 'declined' ? <DeclinedOrder order={order} /> : null}
      </div>
    )
  }
  if (query.isError) {
    const notFound = isApiError(query.error) && (query.error.code === 'ORDER_NOT_FOUND' || query.error.code === 'FORBIDDEN')
    return (
      <section role="alert" data-testid="order-error" className="flex flex-col items-start gap-4 rounded-card bg-card p-6">
        <h1 className="text-xl font-bold">{notFound ? 'Pedido não encontrado' : 'Não foi possível carregar o pedido'}</h1>
        {notFound ? (
          <Button asChild className="rounded-sm font-bold">
            <Link to="/">Voltar ao início</Link>
          </Button>
        ) : (
          <Button className="rounded-sm font-bold" onClick={() => void query.refetch()}>
            Tentar novamente
          </Button>
        )}
      </section>
    )
  }
  return <OrderSkeleton />
}

const cardClass = 'relative w-full max-w-[36.125rem] overflow-hidden bg-card shadow-[0_12px_32px_rgb(0_0_0/0.35)]'

function CloseLink() {
  return (
    <Link
      to="/"
      aria-label="Fechar e voltar ao início"
      className="absolute top-4 right-4 inline-flex size-8 items-center justify-center rounded-sm text-brand outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      <X className="size-5" aria-hidden="true" />
    </Link>
  )
}

function PendingOrder({ order }: { order: Order }) {
  return (
    <section aria-labelledby="order-title" className={`${cardClass} flex flex-col items-center gap-4 px-6 py-12 text-center`} data-testid="order-pending">
      <Loader2 className="size-10 animate-spin text-brand motion-reduce:animate-none" aria-hidden="true" />
      <h1 id="order-title" className="text-lg font-bold tracking-[0.04em]">
        Processando pagamento…
      </h1>
      <p className="max-w-prose text-[0.8125rem] text-muted-foreground">
        Aguardando a confirmação na rede {NETWORK_NAMES[order.network]}. Você pode atualizar a página: o pedido não será
        duplicado.
      </p>
      <p className="text-[0.8125rem] text-subtle-foreground">
        Pedido {order.id} · Total {formatEth(order.receipt.total)}
      </p>
    </section>
  )
}

function DeclinedOrder({ order }: { order: Order & { status: 'declined' } }) {
  return (
    <section aria-labelledby="order-title" className={`${cardClass} flex flex-col items-center gap-4 px-6 py-12 text-center`} data-testid="order-declined">
      <CloseLink />
      <AlertTriangle className="size-10 text-destructive" aria-hidden="true" />
      <h1 id="order-title" className="text-lg font-bold tracking-[0.04em]">
        Pagamento recusado
      </h1>
      <p className="max-w-prose text-[0.875rem] text-foreground" data-testid="order-decline-reason">
        {order.decline.message}
      </p>
      <p className="text-[0.8125rem] text-muted-foreground">Nenhum valor foi cobrado e seus itens continuam no carrinho.</p>
      <div className="flex flex-wrap justify-center gap-3">
        <Button asChild className="rounded-sm font-bold">
          <Link to="/checkout">Tentar novamente</Link>
        </Button>
        <Button asChild variant="outline" className="rounded-sm">
          <Link to="/carrinho">Voltar ao carrinho</Link>
        </Button>
      </div>
    </section>
  )
}

function Receipt({ order }: { order: Order & { status: 'confirmed' } }) {
  const { receipt } = order
  return (
    <article aria-labelledby="order-title" className={cardClass} data-testid="order-receipt">
      <CloseLink />
      <header className="flex flex-col items-center gap-4 px-6 pt-6 pb-5 text-center">
        <MailOpen className="size-16 text-brand" aria-hidden="true" strokeWidth={1.25} />
        <h1 id="order-title" className="text-base font-bold tracking-[0.04em] text-muted-foreground">
          Seus NFTs agora estão na sua carteira
        </h1>
      </header>
      <dl className="grid grid-cols-2 gap-y-3 border-y border-primary px-6 py-3 text-[0.8125rem] sm:grid-cols-4 sm:divide-x sm:divide-primary">
        <div className="flex flex-col sm:pr-3">
          <dt className="font-bold text-muted-foreground">ID da transação</dt>
          <dd className="text-subtle-foreground" title={order.transaction.hash} data-testid="receipt-tx">
            {shortHash(order.transaction.hash)}
          </dd>
        </div>
        <div className="flex flex-col sm:px-3">
          <dt className="text-subtle-foreground">Data</dt>
          <dd className="text-subtle-foreground">
            <time dateTime={order.createdAt}>{formatOrderDate(order.createdAt)}</time>
          </dd>
        </div>
        <div className="flex flex-col sm:px-3">
          <dt className="text-subtle-foreground">Total</dt>
          <dd className="text-subtle-foreground">{formatEth(receipt.total)}</dd>
        </div>
        <div className="flex flex-col sm:pl-3">
          <dt className="font-bold text-muted-foreground">Carteira</dt>
          <dd className="text-subtle-foreground">{PROVIDER_LABELS[order.wallet.provider]}</dd>
        </div>
      </dl>
      <section aria-labelledby="receipt-details" className="flex flex-col gap-3 px-6 pt-6 pb-8 md:px-11">
        <h2 id="receipt-details" className="text-[0.9375rem] font-bold">
          Detalhes da transação
        </h2>
        <div className="grid grid-cols-[minmax(0,1fr)_2.75rem_5.25rem] gap-x-2 md:grid-cols-[minmax(0,1fr)_4.5rem_6.5rem] md:gap-x-0 border-b border-border pb-2 text-[0.9375rem] font-bold" aria-hidden="true">
          <span>NFTs</span>
          <span className="text-center"><span className="md:hidden">Qtd.</span><span className="hidden md:inline">Edições</span></span>
          <span className="text-right">Subtotal</span>
        </div>
        <ul className="flex flex-col gap-3" data-testid="receipt-lines">
          {receipt.lines.map((line) => (
            <li key={`${line.nftId}:${line.editionId}`} className="grid grid-cols-[minmax(0,1fr)_2.75rem_5.25rem] gap-x-2 md:grid-cols-[minmax(0,1fr)_4.5rem_6.5rem] md:gap-x-0 items-center" data-testid="receipt-line">
              <div className="flex min-w-0 items-center gap-3">
                <img src={line.image.url} alt="" width={line.image.width} height={line.image.height} className="size-12 shrink-0 rounded-sm object-cover md:size-[4.375rem]" />
                <div className="min-w-0">
                  <p className="font-bold break-words md:truncate" data-testid="receipt-line-name">
                    {line.name}
                  </p>
                  <p className="text-[0.75rem] text-subtle-foreground md:truncate md:text-[0.8125rem]">
                    ID do token: {line.tokenId} · {line.editionLabel}
                  </p>
                  <p className="text-[0.75rem] text-subtle-foreground">
                    <span className="sr-only">Preço unitário: </span>
                    {formatEth(line.unitPrice)} cada
                  </p>
                </div>
              </div>
              <span className="text-center text-[0.8125rem] text-muted-foreground">
                <span className="sr-only">Quantidade: </span>(x {line.quantity})
              </span>
              <span className="text-right font-bold text-brand" data-testid="receipt-line-total">
                {formatEth(line.lineTotal)}
              </span>
            </li>
          ))}
        </ul>
        <dl className="ml-auto flex w-full max-w-[20rem] flex-col gap-1 border-b border-border pb-3 text-[0.9375rem]">
          {!isZeroEth(receipt.discount) ? (
            <div className="flex justify-between gap-4">
              <dt>Desconto{receipt.couponCode ? ` (${receipt.couponCode})` : ''}</dt>
              <dd data-testid="receipt-discount">(-) {formatEth(receipt.discount)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-4">
            <dt>Taxa de rede</dt>
            <dd data-testid="receipt-fee">{formatEth(receipt.networkFee)}</dd>
          </div>
          <div className="flex justify-between gap-4 font-bold">
            <dt>Total</dt>
            <dd className="text-brand" data-testid="receipt-total">
              {formatEth(receipt.total)}
            </dd>
          </div>
        </dl>
        <p className="text-center text-[0.8125rem] leading-relaxed text-muted-foreground">
          Transação confirmada na {NETWORK_NAMES[order.network]}. A propriedade foi transferida para sua carteira conectada e
          registrada na rede.
        </p>
        <Button asChild className="self-center rounded-sm font-bold">
          <a href={order.transaction.explorerUrl} target="_blank" rel="noopener noreferrer">
            Ver no {EXPLORER_NAMES[order.network]}
          </a>
        </Button>
      </section>
      <div className="h-2.5 bg-primary" aria-hidden="true" />
    </article>
  )
}

function OrderSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite" className="flex justify-center" data-testid="order-skeleton">
      <span className="sr-only">Carregando pedido…</span>
      <Skeleton aria-hidden="true" className="h-[32rem] w-full max-w-[36.125rem] bg-card" />
    </div>
  )
}
