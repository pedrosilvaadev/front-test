import {
  walletInputSchema,
  type Network,
  type Wallet,
  type WalletInput,
  type WalletProvider,
  type WalletSlot,
} from '@/contracts'
import { apiErrorCode, apiFieldErrorKeys } from '@/features/profile/account-errors'

/** Figma "Carteiras" form model; `ens` is the ENS name without `.eth`. */
export interface WalletFormValues {
  displayName: string
  label: string
  network: Network | ''
  profileName: string
  address: string
  alternateAddress: string
  provider: WalletProvider | ''
  referralCode: string
  email: string
  ens: string
}
export type WalletField = keyof WalletFormValues
export type WalletErrors = Partial<Record<WalletField, string>>

export const WALLET_MESSAGES: Record<WalletField, string> = {
  displayName: 'Informe o nome de exibição (2 a 50 caracteres).',
  label: 'Informe o apelido da carteira (2 a 40 caracteres).',
  network: 'Selecione uma rede.',
  profileName: 'Informe o nome do perfil (2 a 50 caracteres).',
  address: 'Endereço inválido para a rede selecionada.',
  alternateAddress: 'Use no máximo 100 caracteres.',
  provider: 'Selecione o tipo de carteira.',
  referralCode: 'Use de 4 a 12 letras ou números.',
  email: 'Informe um e-mail válido.',
  ens: 'Use de 3 a 63 letras minúsculas, números ou "-".',
}

const FIELD_OF: Record<string, WalletField> = {
  displayName: 'displayName',
  label: 'label',
  network: 'network',
  profileName: 'profileName',
  address: 'address',
  alternateAddress: 'alternateAddress',
  provider: 'provider',
  referralCode: 'referralCode',
  email: 'email',
  ensName: 'ens',
}

export const SLOT_TITLES: Record<WalletSlot, string> = { primary: 'Carteira principal', secondary: 'Carteira secundária' }

const stripEth = (value: string) => value.replace(/\.eth$/i, '')

export const EMPTY_WALLET_FORM: WalletFormValues = {
  displayName: '',
  label: '',
  network: '',
  profileName: '',
  address: '',
  alternateAddress: '',
  provider: '',
  referralCode: '',
  email: '',
  ens: '',
}

export function walletFormValues(wallet: Wallet | WalletInput | null): WalletFormValues {
  if (!wallet) return { ...EMPTY_WALLET_FORM }
  return {
    displayName: wallet.displayName,
    label: wallet.label,
    network: wallet.network,
    profileName: wallet.profileName,
    address: wallet.address,
    alternateAddress: wallet.alternateAddress ?? '',
    provider: wallet.provider,
    referralCode: wallet.referralCode,
    email: wallet.email,
    ens: stripEth(wallet.ensName),
  }
}

/** Validates with `walletInputSchema` (the address must match the network). */
export function validateWallet(values: WalletFormValues): { ok: true; data: WalletInput } | { ok: false; errors: WalletErrors } {
  const ens = values.ens.trim()
  const parsed = walletInputSchema.safeParse({
    label: values.label,
    displayName: values.displayName,
    profileName: values.profileName,
    email: values.email,
    network: values.network,
    provider: values.provider,
    address: values.address,
    alternateAddress: values.alternateAddress.trim() === '' ? null : values.alternateAddress,
    ensName: `${stripEth(ens).toLowerCase()}.eth`,
    referralCode: values.referralCode,
  })
  if (parsed.success) return { ok: true, data: parsed.data }
  const errors: WalletErrors = {}
  for (const issue of parsed.error.issues) {
    const field = FIELD_OF[String(issue.path[0])]
    if (field && !errors[field]) errors[field] = WALLET_MESSAGES[field]
  }
  return { ok: false, errors }
}

/** Server failure of `PUT /api/wallets/:slot` → field errors and/or a form message. */
export function walletServerError(error: unknown): { errors: WalletErrors; message: string | null } {
  const code = apiErrorCode(error)
  if (code === 'PRIMARY_WALLET_REQUIRED') {
    return { errors: {}, message: 'Cadastre a carteira principal antes da secundária.' }
  }
  if (code === 'VALIDATION_ERROR') {
    const errors: WalletErrors = {}
    for (const key of apiFieldErrorKeys(error)) {
      const field = FIELD_OF[key]
      if (field) errors[field] = WALLET_MESSAGES[field]
    }
    return { errors, message: 'Corrija os campos destacados.' }
  }
  return { errors: {}, message: null }
}

export function connectionErrorMessage(error: unknown): string | null {
  switch (apiErrorCode(error)) {
    case 'WALLET_CONNECTION_REJECTED':
      return 'A conexão foi recusada na carteira. Aprove a conexão e tente novamente.'
    case 'WALLET_NETWORK_MISMATCH':
      return 'A carteira pertence a outra rede.'
    case 'WALLET_NOT_FOUND':
      return 'Carteira não encontrada. Atualize a página.'
    default:
      return null
  }
}

/** Short form of an address for summaries (`0x1234…abcd`). */
export function shortAddress(address: string): string {
  return address.length > 14 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address
}
