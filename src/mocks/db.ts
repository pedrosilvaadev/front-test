import { z } from 'zod'
import {
  guestCartIdSchema,
  idSchema,
  isoDateTimeSchema,
  nftDetailSchema,
  orderSchema,
  quantitySchema,
  quoteSchema,
  versionSchema,
  walletSchema,
  type NftDetail,
} from '@/contracts'
import { createNftSeed } from './fixtures/nfts'
import { SEED_USERS, userRecordSchema, type UserRecord } from './fixtures/users'
import { SEED_WALLETS } from './fixtures/wallets'

/**
 * Simulated server-side state. Every mutation goes through `updateDb` so the
 * state is persisted consistently and `resetDb()` restores the exact seed.
 *
 * Persistence: in the browser `initDb(window.localStorage)` loads/saves the
 * state under `DB_STORAGE_KEY` as `{ schemaVersion, state }`. A missing,
 * corrupt, invalid or other-version snapshot falls back to the seed. Reads
 * never write; only `updateDb` (mutations) and `resetDb` touch storage.
 * In Node/Vitest nothing is attached, so the db is memory only.
 *
 * Bump `DB_SCHEMA_VERSION` whenever the persisted shape or the seed changes
 * in a way that old snapshots must not survive.
 */
export const DB_STORAGE_KEY = 'kurio.mockDb'
export const DB_SCHEMA_VERSION = 5

/**
 * Server-side session (ADR-005). Only the SHA-256 of the opaque bearer token
 * is stored, so a leaked snapshot cannot be replayed as a token. Logout
 * deletes the record; expiry keeps it until pruned so the API can answer
 * `SESSION_EXPIRED` instead of `UNAUTHORIZED`.
 */
export const sessionRecordSchema = z.object({
  tokenHash: z.string().regex(/^[0-9a-f]{64}$/),
  userId: idSchema,
  createdAt: isoDateTimeSchema,
  expiresAt: isoDateTimeSchema,
})
export type SessionRecord = z.infer<typeof sessionRecordSchema>

/**
 * Server-side cart (ADR-006). Owned by a user (`userId`) or a guest
 * (`guestCartId`, client generated UUID). Stores only references and
 * quantities; the catalog snapshot and totals are computed per response.
 * `coupon` is the normalized code; its details come from `coupons.ts`.
 */
export const cartRecordSchema = z.object({
  id: idSchema,
  owner: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('user'), userId: idSchema }),
    z.object({ kind: z.literal('guest'), guestCartId: guestCartIdSchema }),
  ]),
  items: z.array(z.object({ id: idSchema, nftId: idSchema, editionId: idSchema, quantity: quantitySchema })),
  coupon: z.string().min(1).nullable(),
  version: versionSchema,
  updatedAt: isoDateTimeSchema,
})
export type CartRecord = z.infer<typeof cartRecordSchema>

/** Issued quote with the owner key it belongs to (`user:<id>` | `guest:<uuid>`). */
export const quoteRecordSchema = z.object({ ownerKey: z.string().min(1), quote: quoteSchema })
export type QuoteRecord = z.infer<typeof quoteRecordSchema>

export const walletRecordSchema = z.object({ userId: idSchema, wallet: walletSchema })
export type WalletRecord = z.infer<typeof walletRecordSchema>

/**
 * Order + server-only bookkeeping (P4-02): idempotency fingerprint, the stock
 * reserved at creation, and the deterministic resolution decided at creation
 * (`resolveAt` null = stays pending until a dev control resolves it).
 */
export const orderRecordSchema = z.object({
  userId: idSchema,
  fingerprint: z.string(),
  order: orderSchema,
  outcome: z.enum(['confirmed', 'declined']),
  resolveAt: isoDateTimeSchema.nullable(),
  reservations: z.array(z.object({ nftId: idSchema, editionId: idSchema, quantity: quantitySchema })),
})
export type OrderRecord = z.infer<typeof orderRecordSchema>

/** Dev controls for checkout outcomes (`/api/__dev/checkout`); reset restores the defaults. */
export const checkoutControlsSchema = z.object({
  /** Resolution of the next orders: confirm (default), decline, or stay pending. */
  orderOutcome: z.enum(['confirm', 'decline', 'pending']),
  /** Delay before a pending order resolves (on the next read). */
  resolveDelayMs: z.int().min(0).max(600_000),
  /** Simulated wallet answer to `POST /api/wallets/:slot/connection`. */
  walletConnect: z.enum(['accept', 'reject']),
  /** Create the next order, then drop the response (network error) to exercise idempotent retries. */
  dropNextOrderResponses: z.int().min(0).max(10),
})
export type CheckoutControls = z.infer<typeof checkoutControlsSchema>
export const DEFAULT_CHECKOUT_CONTROLS: CheckoutControls = {
  orderOutcome: 'confirm',
  resolveDelayMs: 1500,
  walletConnect: 'accept',
  dropNextOrderResponses: 0,
}

export interface MockDbState {
  nfts: NftDetail[]
  users: UserRecord[]
  /** Persisted so sessions survive a reload (README §3); cleared by `resetDb`. */
  sessions: SessionRecord[]
  /** Guest and user carts (P4-01); cleared by `resetDb`. */
  carts: CartRecord[]
  /** Recently issued quotes (pruned after expiry); referenced by `previousQuoteId` and orders. */
  quotes: QuoteRecord[]
  /** Wallets per user and slot (P4-02 checkout; full management is P3-02). */
  wallets: WalletRecord[]
  /** Orders with idempotency records (P4-02). */
  orders: OrderRecord[]
  checkoutControls: CheckoutControls
}

export interface MockDb extends MockDbState {
  /** Incremented on every reset; lets tests assert a reset happened. Not persisted. */
  generation: number
}

export type DbStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

const persistedSchema = z.object({
  schemaVersion: z.literal(DB_SCHEMA_VERSION),
  state: z.object({
    nfts: z.array(nftDetailSchema),
    users: z.array(userRecordSchema),
    sessions: z.array(sessionRecordSchema),
    carts: z.array(cartRecordSchema),
    quotes: z.array(quoteRecordSchema),
    wallets: z.array(walletRecordSchema),
    orders: z.array(orderRecordSchema),
    checkoutControls: checkoutControlsSchema,
  }),
})

/** Fresh deep copy of the deterministic seed. */
export function createSeedState(): MockDbState {
  return {
    nfts: createNftSeed(),
    users: SEED_USERS.map((record) => structuredClone(record)),
    sessions: [],
    carts: [],
    quotes: [],
    wallets: SEED_WALLETS.map((record) => structuredClone(record)),
    orders: [],
    checkoutControls: { ...DEFAULT_CHECKOUT_CONTROLS },
  }
}

let storage: DbStorage | undefined
let db: MockDb = { ...createSeedState(), generation: 0 }

function loadState(source: DbStorage): MockDbState | undefined {
  try {
    const raw = source.getItem(DB_STORAGE_KEY)
    if (!raw) return undefined
    const parsed = persistedSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data.state : undefined
  } catch {
    // Corrupt JSON or inaccessible storage: start from the seed.
    return undefined
  }
}

function persist(): void {
  if (!storage) return
  const { nfts, users, sessions, carts, quotes, wallets, orders, checkoutControls } = db
  try {
    storage.setItem(
      DB_STORAGE_KEY,
      JSON.stringify({ schemaVersion: DB_SCHEMA_VERSION, state: { nfts, users, sessions, carts, quotes, wallets, orders, checkoutControls } }),
    )
  } catch {
    // Quota exceeded / privacy mode: keep working in memory.
  }
}

/**
 * Attaches (or detaches with `undefined`) a persistence backend and loads its
 * snapshot, falling back to the seed. Snapshots with another schema version
 * are discarded and removed.
 */
export function initDb(source: DbStorage | undefined): MockDb {
  storage = source
  const loaded = source ? loadState(source) : undefined
  if (source && !loaded) {
    try {
      source.removeItem(DB_STORAGE_KEY)
    } catch {
      // ignore
    }
  }
  db = { ...(loaded ?? createSeedState()), generation: db.generation }
  return db
}

/**
 * Re-reads the persisted snapshot when a storage backend is attached (no-op
 * otherwise). Each browser tab runs its own copy of the mock server, so a
 * session/user created by another tab is only visible after a reload; auth
 * calls this on a token-lookup miss. Never writes.
 */
export function reloadDb(): void {
  if (!storage) return
  const loaded = loadState(storage)
  if (loaded) db = { ...loaded, generation: db.generation }
}

export function getDb(): Readonly<MockDb> {
  return db
}

/** Applies a mutation to the db and persists the result. */
export function updateDb<T>(mutate: (state: MockDb) => T): T {
  const result = mutate(db)
  persist()
  return result
}

/** Restores the exact seeded initial state and clears the persisted snapshot. */
export function resetDb(): void {
  db = { ...createSeedState(), generation: db.generation + 1 }
  try {
    storage?.removeItem(DB_STORAGE_KEY)
  } catch {
    // ignore
  }
}

/** Finds an NFT by id or slug. */
export function findNft(idOrSlug: string): NftDetail | undefined {
  return db.nfts.find((nft) => nft.id === idOrSlug || nft.slug === idOrSlug)
}
