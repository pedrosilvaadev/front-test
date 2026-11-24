import type { Wallet } from '@/contracts'

/**
 * Seeded wallets (P4-02). The demo collector (usr_001) has a primary
 * Ethereum wallet (MetaMask) and a secondary Polygon wallet (Coinbase), as in
 * the mobile "Pagamento com carteira" frame; both start disconnected (the
 * checkout connects them). The creator (usr_002) has none, so the checkout
 * form creates one. Addresses are fictitious.
 */
const CREATED_AT = '2026-09-01T12:00:00.000Z'

export interface WalletRecord {
  userId: string
  wallet: Wallet
}

export const SEED_WALLETS: readonly WalletRecord[] = [
  {
    userId: 'usr_001',
    wallet: {
      id: 'wal_usr_001_primary',
      slot: 'primary',
      label: 'Principal',
      displayName: 'Kurio Collector',
      profileName: 'Kurio Collector',
      email: 'colecionador@kurio.test',
      network: 'ethereum',
      provider: 'metamask',
      address: '0xA91F3c5B7d2E4f6a8B0c1D3e5F7a9b2C4d6EE82C',
      alternateAddress: null,
      ensName: 'kurio-collector.eth',
      referralCode: 'KURIO2026',
      connection: null,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    },
  },
  {
    userId: 'usr_001',
    wallet: {
      id: 'wal_usr_001_secondary',
      slot: 'secondary',
      label: 'Reserva',
      displayName: 'Kurio Collector',
      profileName: 'Kurio Collector',
      email: 'colecionador@kurio.test',
      network: 'polygon',
      provider: 'coinbase',
      address: '0x5B2e8C1d4F7a0B3c6D9e2F5a8B1c4D7e0F3a6B9c',
      alternateAddress: null,
      ensName: 'kurio-reserva.eth',
      referralCode: 'KURIO2026',
      connection: null,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    },
  },
]
