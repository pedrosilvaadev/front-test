import {
  buyerSchema,
  walletInputSchema,
  type Buyer,
  type Network,
  type User,
  type Wallet,
  type WalletInput,
  type WalletProvider,
  type WalletSlot,
} from '@/contracts'

/**
 * Figma "Pagamento" form model. The collector profile fields are both the
 * order `buyer` and the wallet record used to pay (`PUT /api/wallets/:slot`),
 * so the user fills them once. "Usar outra carteira?" switches to the
 * secondary slot ("Reserva").
 */
export interface CheckoutValues {
  displayName: string
  username: string
  profileName: string
  email: string
  /** ENS name without the `.eth` suffix (shown as a fixed suffix). */
  ens: string
  referralCode: string
  network: Network | ''
  provider: WalletProvider | ''
  address: string
  alternateAddress: string
  slot: WalletSlot
  note: string
}

export type CheckoutField = Exclude<keyof CheckoutValues, 'slot'>

export const NETWORK_LABELS: Record<Network, string> = { ethereum: 'Ethereum', polygon: 'Polygon', solana: 'Solana' }
export const PROVIDER_LABELS: Record<WalletProvider, string> = {
  metamask: 'MetaMask',
  walletconnect: 'WalletConnect',
  coinbase: 'Coinbase Wallet',
}
export const SLOT_LABELS: Record<WalletSlot, string> = { primary: 'Principal', secondary: 'Reserva' }

const stripEth = (value: string) => value.replace(/\.eth$/i, '')

/** Initial values: saved wallet of the slot, else the session user. */
export function initialValues(user: User, wallet: Wallet | null, slot: WalletSlot): CheckoutValues {
  return {
    displayName: wallet?.displayName ?? user.displayName,
    username: user.username,
    profileName: wallet?.profileName ?? user.displayName,
    email: wallet?.email ?? user.email,
    ens: wallet ? stripEth(wallet.ensName) : '',
    referralCode: wallet?.referralCode ?? '',
    network: wallet?.network ?? '',
    provider: wallet?.provider ?? '',
    address: wallet?.address ?? '',
    alternateAddress: wallet?.alternateAddress ?? '',
    slot,
    note: '',
  }
}

/** Copies the saved wallet of `slot` into the wallet fields (keeps the collector fields typed so far). */
export function applyWallet(values: CheckoutValues, wallet: Wallet | null, slot: WalletSlot): CheckoutValues {
  if (!wallet) return { ...values, slot, network: '', provider: '', address: '', alternateAddress: '' }
  return {
    ...values,
    slot,
    network: wallet.network,
    provider: wallet.provider,
    address: wallet.address,
    alternateAddress: wallet.alternateAddress ?? '',
    ens: values.ens || stripEth(wallet.ensName),
    referralCode: values.referralCode || wallet.referralCode,
  }
}

export type CheckoutErrors = Partial<Record<CheckoutField, string>>

export type ValidationResult =
  | { ok: true; buyer: Buyer; wallet: WalletInput; network: Network; note: string | undefined }
  | { ok: false; errors: CheckoutErrors }

const MESSAGES: Partial<Record<CheckoutField, string>> = {
  displayName: 'Informe o nome de exibição (2 a 50 caracteres).',
  username: 'Use de 3 a 24 letras, números, "_" ou ".".',
  profileName: 'Informe o nome do perfil (2 a 50 caracteres).',
  email: 'Informe um e-mail válido.',
  ens: 'Use de 3 a 63 letras minúsculas, números ou "-".',
  referralCode: 'Use de 4 a 12 letras ou números.',
  network: 'Selecione uma rede.',
  provider: 'Selecione a carteira.',
  address: 'Endereço inválido para a rede selecionada.',
  alternateAddress: 'Use no máximo 100 caracteres.',
  note: 'Use no máximo 500 caracteres.',
}

const FIELD_OF: Record<string, CheckoutField> = {
  displayName: 'displayName',
  username: 'username',
  profileName: 'profileName',
  email: 'email',
  ensName: 'ens',
  referralCode: 'referralCode',
  network: 'network',
  provider: 'provider',
  address: 'address',
  alternateAddress: 'alternateAddress',
}

/** Field order used to focus the first error. */
export const FIELD_ORDER: readonly CheckoutField[] = [
  'displayName',
  'username',
  'network',
  'profileName',
  'address',
  'alternateAddress',
  'referralCode',
  'email',
  'ens',
  'provider',
  'note',
]

export function validateCheckout(values: CheckoutValues, label: string): ValidationResult {
  const errors: CheckoutErrors = {}
  const ensName = `${values.ens.trim().toLowerCase()}.eth`
  const buyer = buyerSchema.safeParse({
    displayName: values.displayName,
    username: values.username,
    profileName: values.profileName,
    email: values.email,
    ensName,
    referralCode: values.referralCode,
  })
  if (!buyer.success) {
    for (const issue of buyer.error.issues) {
      const field = FIELD_OF[String(issue.path[0])]
      if (field && !errors[field]) errors[field] = MESSAGES[field]
    }
  }
  if (!values.network) errors.network = MESSAGES.network
  if (!values.provider) errors.provider = MESSAGES.provider
  const wallet = walletInputSchema.safeParse({
    label,
    displayName: values.displayName,
    profileName: values.profileName,
    email: values.email,
    network: values.network,
    provider: values.provider,
    address: values.address,
    alternateAddress: values.alternateAddress.trim() === '' ? null : values.alternateAddress,
    ensName,
    referralCode: values.referralCode,
  })
  if (!wallet.success) {
    for (const issue of wallet.error.issues) {
      const field = FIELD_OF[String(issue.path[0])]
      if (field && !errors[field]) errors[field] = MESSAGES[field]
    }
  }
  const note = values.note.trim()
  if (note.length > 500) errors.note = MESSAGES.note
  if (!buyer.success || !wallet.success || Object.keys(errors).length > 0 || !values.network) {
    return { ok: false, errors }
  }
  return { ok: true, buyer: buyer.data, wallet: wallet.data, network: values.network, note: note === '' ? undefined : note }
}

/** True when saving `input` would change the stored wallet. */
export function walletDiffers(wallet: Wallet | null, input: WalletInput): boolean {
  if (!wallet) return true
  return (Object.keys(input) as (keyof WalletInput)[]).some((key) => wallet[key] !== input[key])
}

/** `0xA91F…E82C` style shortening for addresses. */
export function shortAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address
}
