import type { CreateOrderRequest } from '@/contracts'

/**
 * Persisted checkout state (ADR-004; docs/API_CONTRACTS.md "Orders →
 * Idempotency"). Dependency-free (types only): the session manager in the
 * entry chunk applies the clearing rules.
 *
 * - Attempt: `localStorage` `kurio.checkoutAttempt.<userId>` =
 *   `{ userId, quoteId, idempotencyKey, payload, orderId? }`, written BEFORE
 *   `POST /api/orders` is sent. Kept on `SESSION_EXPIRED` and re-login as the
 *   same user; deleted when the order is terminal, on explicit logout, or
 *   when a different user signs in.
 * - Draft: non-secret form values in `sessionStorage` (`kurio.checkoutDraft`,
 *   tagged with the user id), same clearing rules.
 */
export const CHECKOUT_ATTEMPT_PREFIX = 'kurio.checkoutAttempt.'
export const CHECKOUT_DRAFT_KEY = 'kurio.checkoutDraft'

export interface CheckoutAttempt {
  userId: string
  quoteId: string
  idempotencyKey: string
  payload: CreateOrderRequest
  orderId?: string
}

function local(): Storage | undefined {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

function session(): Storage | undefined {
  try {
    return globalThis.sessionStorage
  } catch {
    return undefined
  }
}

export function attemptKey(userId: string): string {
  return `${CHECKOUT_ATTEMPT_PREFIX}${userId}`
}

export function readAttempt(userId: string): CheckoutAttempt | null {
  try {
    const raw = local()?.getItem(attemptKey(userId))
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<CheckoutAttempt>
    if (
      value.userId !== userId ||
      typeof value.quoteId !== 'string' ||
      typeof value.idempotencyKey !== 'string' ||
      typeof value.payload !== 'object' ||
      value.payload === null
    ) {
      return null
    }
    return value as CheckoutAttempt
  } catch {
    return null
  }
}

export function writeAttempt(attempt: CheckoutAttempt): void {
  try {
    local()?.setItem(attemptKey(attempt.userId), JSON.stringify(attempt))
  } catch {
    // Storage unavailable: idempotency still holds within this page (key kept in memory by the caller).
  }
}

export function clearAttempt(userId: string): void {
  try {
    local()?.removeItem(attemptKey(userId))
  } catch {
    // ignore
  }
}

/** Removes every persisted attempt that does not belong to `userId` (user switch). */
export function clearForeignAttempts(userId: string | null): void {
  const store = local()
  if (!store) return
  try {
    const keys: string[] = []
    for (let i = 0; i < store.length; i += 1) {
      const key = store.key(i)
      if (key?.startsWith(CHECKOUT_ATTEMPT_PREFIX) && key !== (userId ? attemptKey(userId) : null)) keys.push(key)
    }
    for (const key of keys) store.removeItem(key)
  } catch {
    // ignore
  }
}

export interface CheckoutDraft<T> {
  userId: string
  values: T
}

export function readDraft<T>(userId: string): T | null {
  try {
    const raw = session()?.getItem(CHECKOUT_DRAFT_KEY)
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<CheckoutDraft<T>>
    return value.userId === userId && value.values ? value.values : null
  } catch {
    return null
  }
}

export function writeDraft<T>(userId: string, values: T): void {
  try {
    session()?.setItem(CHECKOUT_DRAFT_KEY, JSON.stringify({ userId, values }))
  } catch {
    // ignore
  }
}

/** Clears the draft (all users, or only when it belongs to someone other than `keepUserId`). */
export function clearDraft(keepUserId?: string | null): void {
  try {
    const store = session()
    if (!store) return
    if (keepUserId) {
      const raw = store.getItem(CHECKOUT_DRAFT_KEY)
      const owner = raw ? (JSON.parse(raw) as { userId?: unknown }).userId : undefined
      if (owner === keepUserId) return
    }
    store.removeItem(CHECKOUT_DRAFT_KEY)
  } catch {
    // ignore
  }
}

/** Explicit logout: forget everything checkout-related of `userId`. */
export function clearCheckoutStateOnLogout(userId: string | null): void {
  if (userId) clearAttempt(userId)
  clearDraft()
}

/** Sign-in (possibly as another user): keep only `userId`'s attempt and draft. */
export function clearCheckoutStateForUser(userId: string): void {
  clearForeignAttempts(userId)
  clearDraft(userId)
}
