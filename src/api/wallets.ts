import {
  walletConnectionSchema,
  walletSchema,
  walletsResponseSchema,
  type Network,
  type Wallet,
  type WalletConnection,
  type WalletInput,
  type WalletSlot,
  type WalletsResponse,
} from '@/contracts'
import { apiClient } from './client'
import { userConfig, type UserRequestOptions } from './profile'

/** Wallets API (checkout + wallets page; docs/API_CONTRACTS.md "Wallets"). Transport only. */

export async function getWallets(options: UserRequestOptions = {}): Promise<WalletsResponse> {
  const { data } = await apiClient.get<unknown>('/wallets', userConfig(options))
  return walletsResponseSchema.parse(data)
}

/** `PUT /api/wallets/:slot` (create or replace). */
export async function putWallet(slot: WalletSlot, body: WalletInput, options: UserRequestOptions = {}): Promise<Wallet> {
  const { data } = await apiClient.put<unknown>(`/wallets/${slot}`, body, userConfig(options))
  return walletSchema.parse(data)
}

/** `POST /api/wallets/:slot/connection`; 409 `WALLET_CONNECTION_REJECTED` / `WALLET_NETWORK_MISMATCH`. */
export async function connectWallet(slot: WalletSlot, network: Network, options: UserRequestOptions = {}): Promise<WalletConnection> {
  const { data } = await apiClient.post<unknown>(`/wallets/${slot}/connection`, { network }, userConfig(options))
  return walletConnectionSchema.parse(data)
}

/** `DELETE /api/wallets/:slot/connection` → 204 (idempotent). */
export async function disconnectWallet(slot: WalletSlot, options: UserRequestOptions = {}): Promise<void> {
  await apiClient.delete(`/wallets/${slot}/connection`, userConfig(options))
}
