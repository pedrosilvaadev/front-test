import { z } from 'zod'
import {
  displayNameSchema,
  emailSchema,
  ensNameSchema,
  idSchema,
  isAddressForNetwork,
  isoDateTimeSchema,
  networkSchema,
  referralCodeSchema,
} from './common/primitives'

/**
 * Wallets (README §3 "Carteiras"; §5 "Carteiras"). Exactly two slots:
 * primary and secondary. Fields follow the Figma "Carteiras" form. Auth required.
 */
export const WALLET_SLOTS = ['primary', 'secondary'] as const
export const walletSlotSchema = z.enum(WALLET_SLOTS)
export type WalletSlot = z.infer<typeof walletSlotSchema>

/** "Tipo de carteira". */
export const WALLET_PROVIDERS = ['metamask', 'walletconnect', 'coinbase'] as const
export const walletProviderSchema = z.enum(WALLET_PROVIDERS)
export type WalletProvider = z.infer<typeof walletProviderSchema>

const walletFields = {
  /** "Apelido da carteira". */
  label: z.string().trim().min(2).max(40),
  displayName: displayNameSchema,
  profileName: z.string().trim().min(2).max(50),
  email: emailSchema,
  network: networkSchema,
  provider: walletProviderSchema,
  address: z.string().trim(),
  /** "ENS ou carteira secundária (opcional)". */
  alternateAddress: z.string().trim().max(100).nullable(),
  ensName: ensNameSchema,
  referralCode: referralCodeSchema,
}

/** Address must match the selected network (EVM 0x… for Ethereum/Polygon, base58 for Solana). */
function addressMatchesNetwork(value: { address: string; network: z.infer<typeof networkSchema> }) {
  return isAddressForNetwork(value.address, value.network)
}
const addressIssue = { path: ['address'], message: 'Address is not valid for the selected network' }

/** `PUT /api/wallets/:slot` body (create or replace). */
export const walletInputSchema = z.object(walletFields).refine(addressMatchesNetwork, addressIssue)
export type WalletInput = z.infer<typeof walletInputSchema>

/**
 * Simulated connection ("simulação de conexão, recusa e desconexão"), held
 * server side so it survives refresh (returned inside `Wallet.connection`).
 * `POST /api/wallets/:slot/connection` → 200 connection, or 409
 * WALLET_CONNECTION_REJECTED when the (simulated) user rejects, or 409
 * WALLET_NETWORK_MISMATCH when `network` ≠ the wallet's `network`.
 * `DELETE /api/wallets/:slot/connection` → 204 (idempotent).
 *
 * Network compatibility rule: a wallet belongs to exactly one network. It can
 * only be connected on that network, and an order can only use it when
 * `order.network === wallet.network` (else 409 WALLET_NETWORK_MISMATCH) and
 * its connection is active (else 409 WALLET_NOT_CONNECTED).
 */
export const walletConnectRequestSchema = z.object({ network: networkSchema })
export type WalletConnectRequest = z.infer<typeof walletConnectRequestSchema>

export const walletConnectionSchema = z.object({
  walletId: idSchema,
  slot: walletSlotSchema,
  network: networkSchema,
  status: z.literal('connected'),
  connectedAt: isoDateTimeSchema,
})
export type WalletConnection = z.infer<typeof walletConnectionSchema>

export const walletSchema = z
  .object({
    id: idSchema,
    slot: walletSlotSchema,
    ...walletFields,
    /** Active simulated connection; null = disconnected (initial state, after DELETE, after a rejection). */
    connection: walletConnectionSchema.nullable(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
  })
  .refine(addressMatchesNetwork, addressIssue)
  .refine(
    (w) =>
      w.connection === null ||
      (w.connection.walletId === w.id && w.connection.slot === w.slot && w.connection.network === w.network),
    { path: ['connection'], message: 'Connection must reference this wallet and its network' },
  )
export type Wallet = z.infer<typeof walletSchema>

/** `GET /api/wallets`. Changing a wallet's `network` or `address` via PUT drops its connection. */
export const walletsResponseSchema = z.object({
  primary: walletSchema.nullable(),
  secondary: walletSchema.nullable(),
})
export type WalletsResponse = z.infer<typeof walletsResponseSchema>
