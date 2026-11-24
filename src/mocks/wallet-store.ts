import type { Network, Wallet, WalletConnection, WalletInput, WalletSlot } from '@/contracts'
import { getDb, reloadDb, updateDb } from './db'

/**
 * Wallets of the mock server (P4-02: the endpoints checkout needs; the full
 * management page is P3-02). Connection state is server side, so it survives
 * refresh (docs/API_CONTRACTS.md "Wallets").
 */

export function listWallets(userId: string): { primary: Wallet | null; secondary: Wallet | null } {
  const mine = getDb().wallets.filter((record) => record.userId === userId)
  const bySlot = (slot: WalletSlot) => structuredClone(mine.find((record) => record.wallet.slot === slot)?.wallet ?? null)
  return { primary: bySlot('primary'), secondary: bySlot('secondary') }
}

export function findWalletById(userId: string, walletId: string): Wallet | undefined {
  return getDb().wallets.find((record) => record.userId === userId && record.wallet.id === walletId)?.wallet
}

export type PutWalletResult =
  | { ok: true; created: boolean; wallet: Wallet }
  | { ok: false; code: 'PRIMARY_WALLET_REQUIRED' }

/** Creates or replaces a slot. Changing `network` or `address` drops the connection. */
export function putWallet(userId: string, slot: WalletSlot, input: WalletInput, now = Date.now()): PutWalletResult {
  reloadDb()
  const current = listWallets(userId)
  if (slot === 'secondary' && !current.primary) return { ok: false, code: 'PRIMARY_WALLET_REQUIRED' }
  const existing = current[slot]
  const at = new Date(now).toISOString()
  const keepConnection = existing?.connection && existing.network === input.network && existing.address === input.address
  const wallet: Wallet = {
    id: existing?.id ?? `wal_${userId}_${slot}`,
    slot,
    ...input,
    connection: keepConnection ? existing.connection : null,
    createdAt: existing?.createdAt ?? at,
    updatedAt: at,
  }
  updateDb((state) => {
    state.wallets = [
      ...state.wallets.filter((record) => !(record.userId === userId && record.wallet.slot === slot)),
      { userId, wallet },
    ]
  })
  return { ok: true, created: !existing, wallet: structuredClone(wallet) }
}

export type ConnectResult =
  | { ok: true; connection: WalletConnection }
  | { ok: false; code: 'WALLET_NOT_FOUND' | 'WALLET_CONNECTION_REJECTED' | 'WALLET_NETWORK_MISMATCH' }

/** Simulated provider connection; the answer comes from the dev checkout controls (default accept). */
export function connectWallet(userId: string, slot: WalletSlot, network: Network, now = Date.now()): ConnectResult {
  reloadDb()
  const wallet = listWallets(userId)[slot]
  if (!wallet) return { ok: false, code: 'WALLET_NOT_FOUND' }
  if (wallet.network !== network) return { ok: false, code: 'WALLET_NETWORK_MISMATCH' }
  if (getDb().checkoutControls.walletConnect === 'reject') {
    setConnection(userId, slot, null)
    return { ok: false, code: 'WALLET_CONNECTION_REJECTED' }
  }
  const connection: WalletConnection = {
    walletId: wallet.id,
    slot,
    network,
    status: 'connected',
    connectedAt: new Date(now).toISOString(),
  }
  setConnection(userId, slot, connection)
  return { ok: true, connection }
}

export function setConnection(userId: string, slot: WalletSlot, connection: WalletConnection | null): void {
  updateDb((state) => {
    for (const record of state.wallets) {
      if (record.userId === userId && record.wallet.slot === slot) record.wallet.connection = connection
    }
  })
}

/** Dev control: drop every active connection (optionally of one user). */
export function disconnectAll(userId?: string): number {
  reloadDb()
  return updateDb((state) => {
    let count = 0
    for (const record of state.wallets) {
      if ((userId === undefined || record.userId === userId) && record.wallet.connection) {
        record.wallet.connection = null
        count += 1
      }
    }
    return count
  })
}
