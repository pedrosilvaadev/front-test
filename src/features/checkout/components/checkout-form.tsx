import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { AlertTriangle, ChevronDown } from 'lucide-react'
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { isApiError } from '@/api/errors'
import { Skeleton } from '@/components/ui/skeleton'
import {
  NETWORKS,
  quoteChangedDetailsSchema,
  WALLET_PROVIDERS,
  type Cart,
  type Network,
  type Quote,
  type QuoteChange,
  type User,
  type Wallet,
  type WalletsResponse,
  type WalletSlot,
} from '@/contracts'
import { quoteChangeMessage } from '@/features/cart/cart-errors'
import { useCartQuote, type CartOwner } from '@/features/cart/cart-queries'
import { formatEth } from '@/lib/money'
import { queryKeys } from '@/lib/query-keys'
import { cn } from '@/lib/utils'
import {
  applyWallet,
  FIELD_ORDER,
  initialValues,
  NETWORK_LABELS,
  PROVIDER_LABELS,
  shortAddress,
  SLOT_LABELS,
  validateCheckout,
  walletDiffers,
  type CheckoutErrors,
  type CheckoutField,
  type CheckoutValues,
} from '../checkout-form'
import { loadOrdersApi, loadWalletsApi } from '../checkout-queries'
import { readAttempt, readDraft, writeDraft } from '../checkout-storage'
import { placeOrder } from '../place-order'

const fieldClass = cn(
  'h-12 w-full min-w-0 rounded-[0.625rem] border border-border bg-transparent px-4 text-sm tracking-[0.02em] text-foreground outline-none md:h-10 md:rounded-[0.125rem] md:text-[0.8125rem]',
  'placeholder:text-subtle-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/40',
  'aria-invalid:border-destructive',
)
const labelClass = 'text-[0.9375rem] tracking-[0.04em] text-foreground'

interface FieldShellProps {
  id: string
  label: string
  required?: boolean
  error?: string
  className?: string
  srOnlyLabel?: boolean
  children: ReactNode
}

function FieldShell({ id, label, required, error, className, srOnlyLabel, children }: FieldShellProps) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <label htmlFor={id} className={cn(labelClass, srOnlyLabel && 'sr-only')}>
        {label}
        {required ? (
          <span aria-hidden="true" className="text-brand">
            *
          </span>
        ) : null}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}

interface Review {
  message: string
  changes: QuoteChange[]
}

interface CheckoutFormProps {
  user: User
  cart: Cart
  owner: CartOwner
  wallets: WalletsResponse
}

/**
 * Figma "Pagamento": collector profile + wallet fields, wallet choice,
 * quote summary and "Confirmar compra". Submitting saves/connects the wallet
 * when needed and places the order idempotently (`placeOrder`, ADR-004).
 * A quote whose values changed must be explicitly accepted before paying.
 */
export function CheckoutForm({ user, cart, owner, wallets }: CheckoutFormProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const formId = useId()
  const fieldId = (field: CheckoutField) => `${formId}-${field}`
  const [values, setValues] = useState<CheckoutValues>(
    () => readDraft<CheckoutValues>(user.id) ?? initialValues(user, wallets.primary, 'primary'),
  )
  const [errors, setErrors] = useState<CheckoutErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [review, setReview] = useState<Review | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const inFlight = useRef(false)
  const acknowledged = useRef<Set<string>>(new Set())
  const [previousAttempt] = useState(() => readAttempt(user.id))

  const network: Network = values.network || 'ethereum'
  const quote = useCartQuote(owner, cart.version, network)
  const current = quote.data?.cartVersion === cart.version && quote.data.network === network ? quote.data : undefined

  // Draft: non-secret values only (sessionStorage, per user).
  useEffect(() => writeDraft(user.id, values), [user.id, values])

  // A refreshed quote reporting price/availability/coupon/fee changes must be accepted first.
  useEffect(() => {
    if (current && current.changes.length > 0 && !acknowledged.current.has(current.quoteId)) {
      setReview({ message: 'Os valores do seu pedido mudaram. Revise e confirme novamente.', changes: current.changes })
    }
  }, [current])

  function update<K extends keyof CheckoutValues>(field: K, value: CheckoutValues[K]) {
    setValues((previous) => ({ ...previous, [field]: value }))
    if (field in errors) setErrors((previous) => ({ ...previous, [field]: undefined }))
  }

  function selectSlot(slot: WalletSlot) {
    setValues((previous) => applyWallet(previous, wallets[slot], slot))
    setErrors({})
  }

  function focusFirst(next: CheckoutErrors) {
    const first = FIELD_ORDER.find((field) => next[field])
    if (first) document.getElementById(fieldId(first))?.focus()
  }

  function acceptReview() {
    if (current) acknowledged.current.add(current.quoteId)
    setReview(null)
  }

  async function handleError(error: unknown) {
    if (!isApiError(error)) {
      setFormError('Não foi possível concluir a compra. Tente novamente.')
      return
    }
    switch (error.code) {
      case 'QUOTE_CHANGED':
      case 'AVAILABILITY_CONFLICT': {
        const details = quoteChangedDetailsSchema.safeParse(error.details)
        if (details.success) {
          const fresh = details.data.quote
          queryClient.setQueryData<Quote>(
            queryKeys.cart.quote(owner.key, { network: fresh.network, cartVersion: fresh.cartVersion }),
            fresh,
          )
          setReview({
            message:
              error.code === 'AVAILABILITY_CONFLICT'
                ? 'Alguns itens não estão mais disponíveis na quantidade cotada. Revise e confirme novamente.'
                : 'Os valores do seu pedido mudaram. Revise e confirme novamente.',
            changes: details.data.changes,
          })
        }
        void queryClient.invalidateQueries({ queryKey: queryKeys.cart.owner(owner.key) })
        return
      }
      case 'QUOTE_EXPIRED':
      case 'QUOTE_NOT_FOUND':
        await queryClient.invalidateQueries({ queryKey: queryKeys.cart.quotes(owner.key) })
        setReview({ message: 'A cotação expirou. Confira os valores atualizados e confirme novamente.', changes: [] })
        return
      case 'WALLET_CONNECTION_REJECTED':
        setFormError('A conexão foi recusada na carteira. Aprove a conexão e tente novamente.')
        return
      case 'WALLET_NETWORK_MISMATCH':
        setFormError('A rede da carteira não corresponde à rede do pedido. Revise a rede selecionada.')
        return
      case 'NETWORK_ERROR':
      case 'TIMEOUT':
        setFormError(
          'Não recebemos a confirmação do pagamento. Sua tentativa foi guardada: tente novamente sem risco de cobrança duplicada.',
        )
        return
      case 'SESSION_EXPIRED':
      case 'UNAUTHORIZED':
        setFormError('Sua sessão expirou. Entre novamente para concluir; sua tentativa foi guardada.')
        return
      case 'VALIDATION_ERROR':
        setFormError('Confira os dados do formulário.')
        return
      default:
        setFormError('Não foi possível concluir a compra. Tente novamente.')
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (inFlight.current || !current || review || !current.purchasable) return
    setFormError(null)
    const slot = values.slot
    const saved: Wallet | null = wallets[slot]
    const result = validateCheckout(values, saved?.label ?? SLOT_LABELS[slot])
    if (!result.ok) {
      setErrors(result.errors)
      focusFirst(result.errors)
      return
    }
    if (result.network !== current.network) return
    setErrors({})
    inFlight.current = true
    setSubmitting(true)
    try {
      const walletsApi = await loadWalletsApi()
      let wallet = saved
      if (!wallet || walletDiffers(wallet, result.wallet)) wallet = await walletsApi.putWallet(slot, result.wallet)
      if (!wallet.connection) await walletsApi.connectWallet(slot, wallet.network)
      void queryClient.invalidateQueries({ queryKey: queryKeys.user.wallets(user.id) })
      const ordersApi = await loadOrdersApi()
      const order = await placeOrder(
        user.id,
        { quoteId: current.quoteId, network: result.network, walletId: wallet.id, buyer: result.buyer, note: result.note },
        { api: ordersApi },
      )
      queryClient.setQueryData(queryKeys.user.order(user.id, order.id), order)
      void navigate({ to: '/pedidos/$orderId', params: { orderId: order.id } })
    } catch (error) {
      await handleError(error)
    } finally {
      inFlight.current = false
      setSubmitting(false)
    }
  }

  const text = (field: Exclude<CheckoutField, 'network' | 'provider' | 'note'>, props: { type?: string; placeholder?: string; autoComplete?: string; inputMode?: 'email' | 'text' } = {}) => ({
    id: fieldId(field),
    name: field,
    value: values[field],
    onChange: (event: { target: { value: string } }) => update(field, event.target.value),
    'aria-invalid': errors[field] ? true : undefined,
    'aria-describedby': errors[field] ? `${fieldId(field)}-error` : undefined,
    className: fieldClass,
    ...props,
  })

  const disabled = submitting || !current || quote.isFetching || Boolean(review) || !current.purchasable

  return (
    <form
      noValidate
      onSubmit={(event) => void handleSubmit(event)}
      aria-label="Pagamento"
      className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_25.3rem] lg:gap-8"
      data-testid="checkout-form"
    >
      <div className="flex min-w-0 flex-col gap-5">
        {previousAttempt ? <AttemptNotice orderId={previousAttempt.orderId} /> : null}

        <WalletCards wallets={wallets} slot={values.slot} onSelect={selectSlot} />

        <fieldset className="flex flex-col gap-4">
          <legend className="mb-4 text-lg font-bold tracking-[0.04em] text-foreground">Perfil do colecionador</legend>
          <div className="grid gap-x-6 gap-y-4 md:grid-cols-2">
            <FieldShell id={fieldId('displayName')} label="Nome de exibição" required error={errors.displayName}>
              <input {...text('displayName', { autoComplete: 'nickname' })} />
            </FieldShell>
            <FieldShell id={fieldId('username')} label="Nome de usuário" required error={errors.username}>
              <input {...text('username', { autoComplete: 'username' })} />
            </FieldShell>
            <FieldShell id={fieldId('network')} label="Rede" required error={errors.network}>
              <div className="relative">
                <select
                  id={fieldId('network')}
                  name="network"
                  value={values.network}
                  onChange={(event) => update('network', event.target.value as Network | '')}
                  aria-invalid={errors.network ? true : undefined}
                  aria-describedby={errors.network ? `${fieldId('network')}-error` : undefined}
                  className={cn(fieldClass, 'appearance-none pr-10', !values.network && 'text-subtle-foreground')}
                >
                  <option value="">Selecione uma rede</option>
                  {NETWORKS.map((item) => (
                    <option key={item} value={item}>
                      {NETWORK_LABELS[item]}
                    </option>
                  ))}
                </select>
                <ChevronDown aria-hidden="true" className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-subtle-foreground" />
              </div>
            </FieldShell>
            <FieldShell id={fieldId('profileName')} label="Nome do perfil" required error={errors.profileName}>
              <input {...text('profileName')} />
            </FieldShell>
            <FieldShell id={fieldId('address')} label="Endereço da carteira" required error={errors.address}>
              <input {...text('address', { placeholder: 'Endereço 0x da carteira', autoComplete: 'off' })} spellCheck={false} />
            </FieldShell>
            <FieldShell
              id={fieldId('alternateAddress')}
              label="ENS ou carteira secundária (opcional)"
              srOnlyLabel
              error={errors.alternateAddress}
              className="md:justify-end"
            >
              <input {...text('alternateAddress', { placeholder: 'ENS ou carteira secundária (opcional)', autoComplete: 'off' })} />
            </FieldShell>
            <FieldShell id={fieldId('referralCode')} label="Código de indicação" required error={errors.referralCode}>
              <input {...text('referralCode', { autoComplete: 'off' })} />
            </FieldShell>
            <FieldShell id={fieldId('email')} label="E-mail" required error={errors.email}>
              <input {...text('email', { type: 'email', inputMode: 'email', autoComplete: 'email' })} />
            </FieldShell>
            <FieldShell id={fieldId('ens')} label="Nome ENS" required error={errors.ens}>
              <div className="flex items-center gap-2">
                <input {...text('ens', { autoComplete: 'off', placeholder: 'seu-nome' })} spellCheck={false} />
                <span className="shrink-0 rounded-sm border border-border px-3 py-2 text-sm text-foreground" aria-hidden="true">
                  .eth
                </span>
              </div>
            </FieldShell>
          </div>
        </fieldset>

        <label className="hidden items-center gap-2 text-[0.9375rem] tracking-[0.04em] text-foreground md:inline-flex">
          <input
            type="checkbox"
            checked={values.slot === 'secondary'}
            disabled={!wallets.primary}
            onChange={(event) => selectSlot(event.target.checked ? 'secondary' : 'primary')}
            className="size-4 accent-[var(--primary)]"
          />
          Usar outra carteira?
        </label>

        <div className="flex flex-col gap-2">
          <label htmlFor={fieldId('note')} className={labelClass}>
            Observação do colecionador (opcional)
          </label>
          <textarea
            id={fieldId('note')}
            name="note"
            value={values.note}
            maxLength={500}
            onChange={(event) => update('note', event.target.value)}
            className={cn(fieldClass, 'h-36 py-3 md:h-[9.5rem] md:max-w-[21.875rem]')}
          />
        </div>
      </div>

      <CheckoutSummary
        quote={current}
        quoteError={quote.isError && !current}
        onRetryQuote={() => void quote.refetch()}
        provider={values.provider}
        providerError={errors.provider}
        providerId={fieldId('provider')}
        onProvider={(provider) => update('provider', provider)}
        review={review}
        onAcceptReview={acceptReview}
        formError={formError}
        submitting={submitting}
        disabled={disabled}
      />
    </form>
  )
}

function AttemptNotice({ orderId }: { orderId: string | undefined }) {
  return (
    <div role="status" data-testid="checkout-attempt-notice" className="rounded-sm border border-border-accent p-3 text-[0.8125rem] text-foreground">
      {orderId ? (
        <>
          Você tem um pagamento iniciado anteriormente.{' '}
          <Link to="/pedidos/$orderId" params={{ orderId }} className="font-bold text-brand underline-offset-4 hover:underline">
            Ver pedido
          </Link>
        </>
      ) : (
        'Sua última tentativa de pagamento não foi confirmada. Ao confirmar, ela será retomada sem cobrança duplicada.'
      )}
    </div>
  )
}

/** Mobile frame "Carteira conectada": saved wallets as radio cards (desktop uses "Usar outra carteira?"). */
function WalletCards({ wallets, slot, onSelect }: { wallets: WalletsResponse; slot: WalletSlot; onSelect: (slot: WalletSlot) => void }) {
  const saved = (['primary', 'secondary'] as const).filter((item) => wallets[item])
  if (saved.length === 0) return null
  return (
    <fieldset className="flex flex-col gap-3 md:hidden">
      <legend className="mb-3 font-bold tracking-[0.04em] text-foreground">Carteira conectada</legend>
      {saved.map((item) => {
        const wallet = wallets[item]
        if (!wallet) return null
        return (
          <label
            key={item}
            className="flex cursor-pointer items-start gap-3 rounded-2xl bg-card p-4 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
          >
            <input
              type="radio"
              name="wallet-slot"
              value={item}
              checked={slot === item}
              onChange={() => onSelect(item)}
              className="mt-1 size-4 accent-[var(--primary)]"
            />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="font-bold text-foreground">{wallet.label}</span>
              <span className="truncate text-sm text-muted-foreground">{shortAddress(wallet.address)}</span>
              <span className="text-sm text-muted-foreground">Rede {NETWORK_LABELS[wallet.network]}</span>
            </span>
          </label>
        )
      })}
    </fieldset>
  )
}

interface CheckoutSummaryProps {
  quote: Quote | undefined
  quoteError: boolean
  onRetryQuote: () => void
  provider: CheckoutValues['provider']
  providerError: string | undefined
  providerId: string
  onProvider: (provider: Exclude<CheckoutValues['provider'], ''>) => void
  review: Review | null
  onAcceptReview: () => void
  formError: string | null
  submitting: boolean
  disabled: boolean
}

function CheckoutSummary(props: CheckoutSummaryProps) {
  const { quote, review } = props
  const amount = (render: (q: Quote) => string) =>
    quote ? render(quote) : <Skeleton className="ml-auto h-5 w-24 bg-accent" aria-hidden="true" />
  return (
    <section aria-labelledby="checkout-summary-title" className="flex min-w-0 flex-col gap-4" data-testid="checkout-summary">
      <h2 id="checkout-summary-title" className="text-lg font-bold tracking-[0.04em] text-foreground">
        Seus NFTs
      </h2>
      <div className="hidden justify-between border-b border-border pb-2 text-[0.9375rem] font-bold md:flex" aria-hidden="true">
        <span>NFTs</span>
        <span>Subtotal</span>
      </div>
      {quote ? (
        <ul className="flex flex-col gap-3" data-testid="checkout-lines">
          {quote.lines.map((line) => (
            <li key={line.cartItemId} className="flex items-center gap-3 bg-card p-1 pr-3" data-testid="checkout-line">
              <img src={line.image.url} alt="" width={line.image.width} height={line.image.height} className="size-[4.375rem] rounded-sm object-cover" />
              <div className="flex min-w-0 flex-1 flex-col">
                <p className="truncate font-bold text-foreground">{line.name}</p>
                <p className="truncate text-[0.8125rem] text-subtle-foreground">
                  ID do token: {line.tokenId} · Edição {line.editionLabel}
                </p>
              </div>
              <span className="text-[0.8125rem] text-muted-foreground">(x {line.quantity})</span>
              <span className="font-bold text-brand" data-testid="checkout-line-total">
                {formatEth(line.lineTotal)}
              </span>
            </li>
          ))}
        </ul>
      ) : props.quoteError ? (
        <div role="alert" className="flex flex-col items-start gap-2 text-[0.8125rem] text-destructive">
          <p>Não foi possível calcular os valores.</p>
          <button type="button" onClick={props.onRetryQuote} className="font-bold text-brand hover:underline">
            Tentar novamente
          </button>
        </div>
      ) : (
        <Skeleton className="h-40 w-full bg-card" aria-hidden="true" />
      )}

      <p className="text-center text-[0.8125rem] text-foreground">
        Tem um código promocional?{' '}
        <Link to="/carrinho" className="font-bold text-brand underline-offset-4 hover:underline">
          Aplique aqui
        </Link>
      </p>

      <div className="flex flex-col gap-2 border-b border-border pb-3 text-[0.9375rem]">
        <dl className="flex flex-col gap-2" aria-busy={!quote || undefined}>
          <Row label="Subtotal" testId="checkout-subtotal" value={amount((q) => formatEth(q.subtotal))} />
          <Row
            label={quote?.coupon ? `Desconto (${quote.coupon.code})` : 'Desconto do lançamento'}
            testId="checkout-discount"
            value={amount((q) => `(-) ${formatEth(q.discount)}`)}
          />
          <Row label="Taxa de rede" testId="checkout-fee" value={amount((q) => formatEth(q.networkFee))} />
        </dl>
        <p className="text-center text-[0.6875rem] text-brand">Taxa estimada</p>
      </div>
      <div className="flex items-baseline justify-between gap-2 px-2">
        <span className="font-bold">Total</span>
        <span className="text-xl font-bold text-brand" data-testid="checkout-total">
          {amount((q) => formatEth(q.total))}
        </span>
      </div>

      <fieldset className="flex flex-col gap-3" aria-describedby={props.providerError ? `${props.providerId}-error` : undefined}>
        <legend className="mb-3 w-full text-center font-bold tracking-[0.04em] text-foreground">Carteira e rede</legend>
        {WALLET_PROVIDERS.map((provider, index) => (
          <label
            key={provider}
            className={cn(
              'flex cursor-pointer items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 md:rounded-none md:bg-transparent',
              props.provider === provider && 'border-foreground',
              'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
            )}
          >
            <input
              type="radio"
              name="provider"
              id={index === 0 ? props.providerId : undefined}
              value={provider}
              checked={props.provider === provider}
              onChange={() => props.onProvider(provider)}
              className="size-4 accent-[var(--primary)]"
            />
            <span className="text-[0.9375rem] text-foreground">{PROVIDER_LABELS[provider]}</span>
          </label>
        ))}
        {props.providerError ? (
          <p id={`${props.providerId}-error`} className="text-xs text-destructive">
            {props.providerError}
          </p>
        ) : null}
      </fieldset>

      {review ? (
        <div role="alert" className="flex flex-col gap-2 rounded-sm border border-brand p-3 text-[0.8125rem]" data-testid="checkout-review">
          <p className="flex items-center gap-2 font-bold text-foreground">
            <AlertTriangle className="size-4 text-brand" aria-hidden="true" />
            {review.message}
          </p>
          {review.changes.length > 0 && quote ? (
            <ul className="flex list-disc flex-col gap-1 pl-5 text-foreground">
              {review.changes.map((change, index) => (
                <li key={`${change.type}-${String(index)}`}>{quoteChangeMessage(change, quote)}</li>
              ))}
            </ul>
          ) : null}
          <button
            type="button"
            onClick={props.onAcceptReview}
            disabled={!quote}
            className="self-start rounded-sm border border-primary px-3 py-1.5 font-bold text-brand outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            Aceitar novos valores
          </button>
        </div>
      ) : null}

      {quote && !quote.purchasable ? (
        <p className="text-[0.8125rem] text-destructive">
          Há itens indisponíveis no carrinho.{' '}
          <Link to="/carrinho" className="font-bold text-brand hover:underline">
            Revisar carrinho
          </Link>
        </p>
      ) : null}

      {props.formError ? (
        <p role="alert" className="text-[0.8125rem] text-destructive" data-testid="checkout-error-message">
          {props.formError}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={props.disabled}
        aria-busy={props.submitting || undefined}
        className="h-14 w-full rounded-full bg-linear-to-r from-primary to-[#a66d3c] text-[0.9375rem] font-bold tracking-[0.04em] text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:h-11 md:rounded-sm md:bg-primary md:bg-none"
      >
        {props.submitting ? 'Confirmando…' : 'Confirmar compra'}
      </button>
      <p className="sr-only" aria-live="polite">
        {props.submitting ? 'Confirmando compra…' : ''}
      </p>
    </section>
  )
}

function Row({ label, value, testId }: { label: string; value: ReactNode; testId: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="whitespace-nowrap tracking-[0.04em] text-foreground">{label}</dt>
      <dd className="whitespace-nowrap text-right tabular-nums text-foreground" data-testid={testId}>
        {value}
      </dd>
    </div>
  )
}
