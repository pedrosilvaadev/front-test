/**
 * Simulated server-side state. Domain collections (users, nfts, carts,
 * orders, ...) are added by later slices; every mutation must go through
 * this module so `resetDb()` restores a known seeded state.
 */
export interface MockDb {
  /** Incremented on every reset; lets tests assert a reset happened. */
  generation: number
}

function createInitialDb(generation: number): MockDb {
  return { generation }
}

let db: MockDb = createInitialDb(0)

export function getDb(): MockDb {
  return db
}

/** Restores the seeded initial state. */
export function resetDb(): void {
  db = createInitialDb(db.generation + 1)
}
