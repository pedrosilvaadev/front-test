import { useState } from 'react'
import type { Edition } from '@/contracts'

export interface QuantityBounds {
  min: number
  /** 0 when the edition is sold out (nothing can be selected). */
  max: number
}

/** Quantity range for one edition: 1 … min(available, maxPerOrder); max 0 when sold out. */
export function quantityBounds(edition: Edition | undefined): QuantityBounds {
  if (!edition || edition.available < 1) return { min: 1, max: 0 }
  return { min: 1, max: Math.min(edition.available, edition.maxPerOrder) }
}

/** Integer clamp to the edition bounds; always ≥ 1 so the stepper never shows 0. */
export function clampQuantity(quantity: number, edition: Edition | undefined): number {
  const { min, max } = quantityBounds(edition)
  const whole = Number.isFinite(quantity) ? Math.trunc(quantity) : min
  if (max < min) return min
  return Math.min(Math.max(whole, min), max)
}

/** First edition with stock; falls back to the first edition when everything is sold out. */
export function defaultEdition(editions: readonly Edition[]): Edition | undefined {
  return editions.find((edition) => edition.available > 0) ?? editions[0]
}

export interface PurchaseSelection {
  edition: Edition | undefined
  quantity: number
  bounds: QuantityBounds
  canDecrement: boolean
  canIncrement: boolean
  soldOut: boolean
  selectEdition: (editionId: string) => void
  increment: () => void
  decrement: () => void
}

/**
 * Edition + quantity chosen on the detail page. The quantity is always
 * derived through `clampQuantity` from the current edition, so switching to a
 * smaller edition (or a refetch that lowers `available`) never leaves an
 * out-of-range value on screen. Sold-out editions cannot be selected.
 */
export function usePurchaseSelection(editions: readonly Edition[]): PurchaseSelection {
  const [editionId, setEditionId] = useState(() => defaultEdition(editions)?.id)
  const [rawQuantity, setRawQuantity] = useState(1)

  const edition = editions.find((item) => item.id === editionId) ?? defaultEdition(editions)
  const bounds = quantityBounds(edition)
  const soldOut = bounds.max === 0
  const quantity = clampQuantity(rawQuantity, edition)

  function selectEdition(nextId: string) {
    const next = editions.find((item) => item.id === nextId)
    if (!next || next.available < 1) return
    setEditionId(next.id)
    setRawQuantity(clampQuantity(quantity, next))
  }

  return {
    edition,
    quantity,
    bounds,
    soldOut,
    canDecrement: !soldOut && quantity > bounds.min,
    canIncrement: !soldOut && quantity < bounds.max,
    selectEdition,
    increment: () => setRawQuantity(clampQuantity(quantity + 1, edition)),
    decrement: () => setRawQuantity(clampQuantity(quantity - 1, edition)),
  }
}
