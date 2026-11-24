/**
 * Guest cart id (ADR-006): a `crypto.randomUUID()` created on the first
 * guest cart write and persisted in `localStorage` (`kurio.guestCartId`).
 * Dependency-free (the session manager in the entry chunk imports it).
 * Forgotten after a successful login/register (the server merged and deleted
 * that cart); a new id is created the next time a guest adds an item.
 */
export const GUEST_CART_STORAGE_KEY = 'kurio.guestCartId'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Listener = () => void
const listeners = new Set<Listener>()
let memory: string | null = null

function storage(): Storage | undefined {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

function notify(): void {
  for (const listener of [...listeners]) listener()
}

/** Stored id, or `null` when absent/invalid (no id is created). */
export function readGuestCartId(): string | null {
  let value: string | null = memory
  try {
    value = storage()?.getItem(GUEST_CART_STORAGE_KEY) ?? memory
  } catch {
    // Storage unavailable: memory only.
  }
  return value && UUID_PATTERN.test(value) ? value.toLowerCase() : null
}

/** Existing id or a new persisted one. */
export function ensureGuestCartId(): string {
  const existing = readGuestCartId()
  if (existing) return existing
  const id = globalThis.crypto.randomUUID()
  memory = id
  try {
    storage()?.setItem(GUEST_CART_STORAGE_KEY, id)
  } catch {
    // Privacy mode: the cart lives for this tab only.
  }
  notify()
  return id
}

/** Drops the id (after a merge). No-op when there is none. */
export function forgetGuestCartId(): void {
  const had = readGuestCartId() !== null
  memory = null
  try {
    storage()?.removeItem(GUEST_CART_STORAGE_KEY)
  } catch {
    // ignore
  }
  if (had) notify()
}

/** `useSyncExternalStore` subscription; also follows other tabs. */
export function subscribeGuestCartId(listener: Listener): () => void {
  listeners.add(listener)
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === GUEST_CART_STORAGE_KEY) listener()
  }
  globalThis.addEventListener?.('storage', onStorage)
  return () => {
    listeners.delete(listener)
    globalThis.removeEventListener?.('storage', onStorage)
  }
}

/** Login/register body with the stored guest cart id (ADR-006 merge); unchanged when there is none. */
export function withGuestCart<T extends object>(body: T): T & { guestCartId?: string } {
  const guestCartId = readGuestCartId()
  return guestCartId ? { ...body, guestCartId } : body
}
