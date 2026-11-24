import { z } from 'zod'
import { idSchema, isoDateTimeSchema, nftDetailSchema, type NftDetail } from '@/contracts'
import { createNftSeed } from './fixtures/nfts'
import { SEED_USERS, userRecordSchema, type UserRecord } from './fixtures/users'

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
export const DB_SCHEMA_VERSION = 3

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

export interface MockDbState {
  nfts: NftDetail[]
  users: UserRecord[]
  /** Persisted so sessions survive a reload (README §3); cleared by `resetDb`. */
  sessions: SessionRecord[]
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
  }),
})

/** Fresh deep copy of the deterministic seed. */
export function createSeedState(): MockDbState {
  return {
    nfts: createNftSeed(),
    users: SEED_USERS.map((record) => structuredClone(record)),
    sessions: [],
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
  const { nfts, users, sessions } = db
  try {
    storage.setItem(DB_STORAGE_KEY, JSON.stringify({ schemaVersion: DB_SCHEMA_VERSION, state: { nfts, users, sessions } }))
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
