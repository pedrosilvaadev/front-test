import { useQuery } from '@tanstack/react-query'
import { useId, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import { NETWORKS, WALLET_PROVIDERS, type Wallet, type WalletSlot, type WalletsResponse } from '@/contracts'
import { AuthedPending } from '@/features/auth/components/authed-states'
import { useDocumentTitle, useSession, useSessionManager } from '@/features/auth/use-session'
import { NETWORK_LABELS, PROVIDER_LABELS } from '@/features/checkout/checkout-form'
import { genericErrorMessage } from '@/features/profile/account-errors'
import { accountInputClass, errorProps, linkButtonClass, primaryButtonClass } from '@/features/profile/account-styles'
import { EnsInput, Field, SelectInput } from '@/features/profile/components/account-fields'
import { AccountShell } from '@/features/profile/components/account-shell'
import { AccountError, AccountLoading } from '@/features/profile/components/account-states'
import { cn } from '@/lib/utils'
import {
  connectionErrorMessage,
  shortAddress,
  SLOT_TITLES,
  validateWallet,
  walletFormValues,
  walletServerError,
  type WalletErrors,
  type WalletField,
  type WalletFormValues,
} from '../wallet-form'
import { useWalletMutations, walletsPageQueryOptions } from '../wallet-queries'

/**
 * Figma "Carteiras" (P3-02): primary and secondary wallets. Add/edit with
 * `walletInputSchema` (address must match the network), simulated
 * connect/disconnect (server-side state, same rules as checkout), and
 * "Igual à carteira principal" copying the primary values into the
 * secondary form. The contract has no wallet deletion endpoint, so removal
 * is not offered (documented gap in docs/tasks/P3-02.md).
 */
export function WalletsPage() {
  useDocumentTitle('Carteiras')
  const session = useSession()
  if (session.status !== 'authenticated') return <AuthedPending />
  return (
    <AccountShell section="wallets" testId="wallets-page">
      <WalletsLoader userId={session.user.id} />
    </AccountShell>
  )
}

function WalletsLoader({ userId }: { userId: string }) {
  const manager = useSessionManager()
  const query = useQuery(walletsPageQueryOptions(userId, manager))
  if (query.data) {
    return (
      <div key={userId} className="flex min-w-0 flex-col gap-10">
        <h1 className="sr-only">Carteiras</h1>
        <WalletSection userId={userId} slot="primary" wallets={query.data} />
        <WalletSection userId={userId} slot="secondary" wallets={query.data} />
      </div>
    )
  }
  if (query.isError) return <AccountError onRetry={() => void query.refetch()} retrying={query.isFetching} />
  return <AccountLoading label="Carregando carteiras…" />
}

function WalletSection({ userId, slot, wallets }: { userId: string; slot: WalletSlot; wallets: WalletsResponse }) {
  const wallet = wallets[slot]
  const primary = wallets.primary
  const titleId = useId()
  // Primary without a wallet opens the form at once (as in the Figma frame).
  const [editing, setEditing] = useState(slot === 'primary' && !wallet)
  const [sameAsPrimary, setSameAsPrimary] = useState(false)
  const [formSeed, setFormSeed] = useState(0)
  const canAdd = slot === 'primary' || primary !== null

  function startEdit() {
    setSameAsPrimary(false)
    setFormSeed((value) => value + 1)
    setEditing(true)
  }

  return (
    <section aria-labelledby={titleId} className="flex min-w-0 flex-col gap-5" data-testid={`wallet-${slot}`}>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h2 id={titleId} className="text-base font-bold tracking-[0.04em] text-foreground md:text-lg">
            {SLOT_TITLES[slot]}
          </h2>
          {slot === 'primary' ? (
            <p className="mt-1 text-[0.8125rem] tracking-[0.04em] text-brand/90">
              Estas carteiras ficam disponíveis no pagamento e para receber NFTs comprados.
            </p>
          ) : !wallet && !editing ? (
            <p className="mt-1 text-[0.8125rem] tracking-[0.04em] text-brand/90">
              Você ainda não adicionou uma carteira secundária.
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-4">
          {slot === 'secondary' && primary ? (
            <label className="inline-flex items-center gap-2 text-[0.8125rem] tracking-[0.04em] text-foreground">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={sameAsPrimary}
                onChange={(event) => {
                  setSameAsPrimary(event.target.checked)
                  setFormSeed((value) => value + 1)
                  if (event.target.checked) setEditing(true)
                }}
              />
              Igual à carteira principal
            </label>
          ) : null}
          {!editing ? (
            <button
              type="button"
              className={linkButtonClass}
              disabled={!canAdd}
              onClick={startEdit}
              aria-label={`${wallet ? 'Editar' : 'Adicionar'} ${SLOT_TITLES[slot].toLowerCase()}`}
            >
              {wallet ? 'Editar' : 'Adicionar'}
            </button>
          ) : null}
        </div>
      </div>
      {!canAdd && !wallet ? (
        <p className="text-xs text-muted-foreground">Cadastre a carteira principal para adicionar uma secundária.</p>
      ) : null}
      {editing ? (
        <WalletForm
          key={formSeed}
          userId={userId}
          slot={slot}
          initial={walletFormValues(sameAsPrimary && primary ? primary : wallet)}
          canCancel={wallet !== null || slot === 'secondary'}
          onDone={() => {
            setEditing(false)
            setSameAsPrimary(false)
          }}
        />
      ) : wallet ? (
        <WalletSummary userId={userId} wallet={wallet} />
      ) : null}
    </section>
  )
}

function WalletSummary({ userId, wallet }: { userId: string; wallet: Wallet }) {
  const { connect, disconnect } = useWalletMutations(userId, wallet.slot)
  const [message, setMessage] = useState<string | null>(null)
  const busy = connect.isPending || disconnect.isPending
  const connected = wallet.connection !== null
  return (
    <div className="flex min-w-0 flex-col gap-4 rounded-sm border border-border bg-card p-4 md:p-6">
      <dl className="grid min-w-0 gap-x-6 gap-y-3 text-sm md:grid-cols-2">
        <SummaryRow label="Apelido da carteira" value={wallet.label} />
        <SummaryRow label="Rede" value={NETWORK_LABELS[wallet.network]} />
        <SummaryRow label="Tipo de carteira" value={PROVIDER_LABELS[wallet.provider]} />
        <SummaryRow label="Endereço" value={<span title={wallet.address}>{shortAddress(wallet.address)}</span>} />
        <SummaryRow label="Nome ENS" value={wallet.ensName} />
        <SummaryRow label="Nome do perfil" value={wallet.profileName} />
      </dl>
      <div className="flex flex-wrap items-center gap-4">
        <span
          data-testid={`wallet-${wallet.slot}-status`}
          className={cn(
            'inline-flex items-center gap-2 text-[0.8125rem] tracking-[0.04em]',
            connected ? 'text-brand' : 'text-muted-foreground',
          )}
        >
          <span aria-hidden="true" className={cn('size-2 rounded-full', connected ? 'bg-primary' : 'bg-subtle-foreground')} />
          {connected ? 'Conectada' : 'Desconectada'}
        </span>
        <button
          type="button"
          className={connected ? linkButtonClass : primaryButtonClass}
          disabled={busy}
          aria-busy={busy || undefined}
          onClick={() => {
            setMessage(null)
            const onError = (error: unknown) => setMessage(connectionErrorMessage(error) ?? genericErrorMessage(error))
            if (connected) disconnect.mutate(undefined, { onError })
            else connect.mutate(wallet.network, { onError })
          }}
        >
          {connected ? 'Desconectar' : 'Conectar'}
        </button>
      </div>
      <p role="alert" className="text-xs text-destructive">
        {message ?? ''}
      </p>
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs tracking-[0.04em] text-muted-foreground">{label}</dt>
      <dd className="break-words text-foreground">{value}</dd>
    </div>
  )
}

interface WalletFormProps {
  userId: string
  slot: WalletSlot
  initial: WalletFormValues
  canCancel: boolean
  onDone: () => void
}

function WalletForm({ userId, slot, initial, canCancel, onDone }: WalletFormProps) {
  const baseId = useId()
  const fieldId = (field: WalletField) => `${baseId}-${field}`
  const { save } = useWalletMutations(userId, slot)
  const [values, setValues] = useState<WalletFormValues>(initial)
  const [errors, setErrors] = useState<WalletErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  function update(field: WalletField, value: string) {
    setValues((current) => ({ ...current, [field]: value }))
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }))
  }

  function focusFirstInvalid() {
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (save.isPending) return
    setFormError(null)
    const result = validateWallet(values)
    if (!result.ok) {
      setErrors(result.errors)
      setFormError('Corrija os campos destacados.')
      focusFirstInvalid()
      return
    }
    setErrors({})
    save.mutate(result.data, {
      onSuccess: onDone,
      onError: (error) => {
        const mapped = walletServerError(error)
        setErrors(mapped.errors)
        setFormError(mapped.message ?? genericErrorMessage(error))
        focusFirstInvalid()
      },
    })
  }

  const text = (field: WalletField, extra: { placeholder?: string; autoComplete?: string } = {}) => ({
    ...errorProps(fieldId(field), errors[field]),
    name: field,
    value: values[field],
    onChange: (event: ChangeEvent<HTMLInputElement>) => update(field, event.target.value),
    className: accountInputClass,
    autoComplete: extra.autoComplete ?? 'off',
    placeholder: extra.placeholder,
  })

  return (
    <form ref={formRef} noValidate onSubmit={handleSubmit} className="flex min-w-0 flex-col gap-6" aria-label={`Formulário da ${SLOT_TITLES[slot].toLowerCase()}`}>
      <div className="grid min-w-0 gap-x-7 gap-y-5 md:grid-cols-2">
        <Field id={fieldId('displayName')} label="Nome de exibição" required error={errors.displayName}>
          <input {...text('displayName', { autoComplete: 'nickname' })} />
        </Field>
        <Field id={fieldId('label')} label="Apelido da carteira" required error={errors.label}>
          <input {...text('label')} />
        </Field>
        <Field id={fieldId('network')} label="Rede" required error={errors.network}>
          <SelectInput
            id={fieldId('network')}
            error={errors.network}
            name="network"
            value={values.network}
            onChange={(event) => update('network', event.target.value)}
            className={cn(!values.network && 'text-subtle-foreground')}
          >
            <option value="">Selecione uma rede</option>
            {NETWORKS.map((network) => (
              <option key={network} value={network}>
                {NETWORK_LABELS[network]}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field id={fieldId('profileName')} label="Nome do perfil" required error={errors.profileName}>
          <input {...text('profileName')} />
        </Field>
        <Field id={fieldId('address')} label="Endereço da carteira" required error={errors.address}>
          <input {...text('address', { placeholder: 'Endereço 0x da carteira' })} spellCheck={false} />
        </Field>
        <Field
          id={fieldId('alternateAddress')}
          label="ENS ou carteira secundária (opcional)"
          srOnlyLabel
          error={errors.alternateAddress}
          className="md:justify-end"
        >
          <input {...text('alternateAddress', { placeholder: 'ENS ou carteira secundária (opcional)' })} spellCheck={false} />
        </Field>
        <Field id={fieldId('provider')} label="Tipo de carteira" required error={errors.provider}>
          <SelectInput
            id={fieldId('provider')}
            error={errors.provider}
            name="provider"
            value={values.provider}
            onChange={(event) => update('provider', event.target.value)}
            className={cn(!values.provider && 'text-subtle-foreground')}
          >
            <option value="">Selecione uma carteira</option>
            {WALLET_PROVIDERS.map((provider) => (
              <option key={provider} value={provider}>
                {PROVIDER_LABELS[provider]}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field id={fieldId('referralCode')} label="Código de indicação" required error={errors.referralCode}>
          <input {...text('referralCode')} />
        </Field>
        <Field id={fieldId('email')} label="E-mail" required error={errors.email}>
          <input {...text('email', { autoComplete: 'email' })} type="email" inputMode="email" />
        </Field>
        <Field id={fieldId('ens')} label="Nome ENS" required error={errors.ens}>
          <EnsInput
            id={fieldId('ens')}
            error={errors.ens}
            name="ens"
            placeholder="seu-nome"
            value={values.ens}
            onChange={(event) => update('ens', event.target.value)}
          />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" className={primaryButtonClass} disabled={save.isPending} aria-busy={save.isPending || undefined}>
          {save.isPending ? 'Salvando…' : 'Salvar carteira'}
        </button>
        {canCancel ? (
          <button type="button" className={linkButtonClass} onClick={onDone} disabled={save.isPending}>
            Cancelar
          </button>
        ) : null}
      </div>
      <p role="alert" className="text-sm text-destructive">
        {formError ?? ''}
      </p>
    </form>
  )
}
