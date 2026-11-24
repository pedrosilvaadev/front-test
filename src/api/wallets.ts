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
import type { RequestOptions } from './nfts'

/** Wallets API used by checkout (docs/API_CONTRACTS.md "Wallets"). Transport only. */

export async function getWallets({ signal }: RequestOptions = {}): Promise<WalletsResponse> {
  const { data } = await apiClient.get<unknown>('/wallets', { signal })
  return walletsResponseSchema.parse(data)
}

/** `PUT /api/wallets/:slot` (create or replace). */
export async function putWallet(slot: WalletSlot, body: WalletInput): Promise<Wallet> {
  const { data } = await apiClient.put<unknown>(`/wallets/${slot}`, body)
  return walletSchema.parse(data)
}

/** `POST /api/wallets/:slot/connection`; 409 `WALLET_CONNECTION_REJECTED` / `WALLET_NETWORK_MISMATCH`. */
export async function connectWallet(slot: WalletSlot, network: Network): Promise<WalletConnection> {
  const { data } = await apiClient.post<unknown>(`/wallets/${slot}/connection`, { network })
  return walletConnectionSchema.parse(data)
}
