import type { CartMergeResult } from '@/contracts'

/**
 * One-shot notice for the guest → user cart merge (ADR-006). Published by the
 * session manager on sign-in, rendered by `CartMergeNotice`, dismissed by the
 * user or replaced on the next sign-in. Cleared on logout.
 * Dependency-free (types only) so the entry chunk stays small.
 */
type Listener = () => void
const listeners = new Set<Listener>()
let current: CartMergeResult | null = null

export function publishCartMergeNotice(result: CartMergeResult | null): void {
  current = result
  for (const listener of [...listeners]) listener()
}

export function readCartMergeNotice(): CartMergeResult | null {
  return current
}

export function dismissCartMergeNotice(): void {
  publishCartMergeNotice(null)
}

export function subscribeCartMergeNotice(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
