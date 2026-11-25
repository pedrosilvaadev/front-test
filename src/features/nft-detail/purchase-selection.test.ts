import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Edition } from '@/contracts'
import { clampQuantity, defaultEdition, quantityBounds, usePurchaseSelection } from './purchase-selection'

const unique = (available: 0 | 1): Edition => ({ id: 'e-1of1', label: '1/1', kind: 'unique', supply: 1, available, maxPerOrder: 1 })
const of10: Edition = { id: 'e-1of10', label: '1/10', kind: 'limited', supply: 10, available: 2, maxPerOrder: 3 }
const of50: Edition = { id: 'e-1of50', label: '1/50', kind: 'limited', supply: 50, available: 30, maxPerOrder: 5 }
const open: Edition = { id: 'e-open', label: 'ABERTA', kind: 'open', supply: null, available: 4, maxPerOrder: 10 }

describe('quantityBounds', () => {
  it('is min(available, maxPerOrder) per edition', () => {
    expect(quantityBounds(unique(1))).toEqual({ min: 1, max: 1 })
    expect(quantityBounds(of10)).toEqual({ min: 1, max: 2 }) // available caps
    expect(quantityBounds(of50)).toEqual({ min: 1, max: 5 }) // maxPerOrder caps
    expect(quantityBounds(open)).toEqual({ min: 1, max: 4 })
  })

  it('is empty (max 0) for a sold-out or missing edition', () => {
    expect(quantityBounds(unique(0))).toEqual({ min: 1, max: 0 })
    expect(quantityBounds(undefined)).toEqual({ min: 1, max: 0 })
  })
})

describe('clampQuantity', () => {
  it('clamps to the bounds and truncates to an integer', () => {
    expect(clampQuantity(0, of50)).toBe(1)
    expect(clampQuantity(-3, of50)).toBe(1)
    expect(clampQuantity(9, of50)).toBe(5)
    expect(clampQuantity(3.7, of50)).toBe(3)
    expect(clampQuantity(Number.NaN, of50)).toBe(1)
  })

  it('never goes below 1, even when sold out', () => {
    expect(clampQuantity(4, unique(0))).toBe(1)
  })
})

describe('defaultEdition', () => {
  it('picks the first edition with stock', () => {
    expect(defaultEdition([unique(0), of10, of50])?.id).toBe('e-1of10')
    expect(defaultEdition([unique(1), of10])?.id).toBe('e-1of1')
  })

  it('falls back to the first edition when all are sold out', () => {
    expect(defaultEdition([unique(0)])?.id).toBe('e-1of1')
  })
})

describe('usePurchaseSelection', () => {
  it('steps within the selected edition bounds', () => {
    const { result } = renderHook(() => usePurchaseSelection([of50, of10]))
    expect(result.current.edition?.id).toBe('e-1of50')
    expect(result.current.quantity).toBe(1)
    expect(result.current.canDecrement).toBe(false)
    expect(result.current.canIncrement).toBe(true)

    for (let i = 0; i < 10; i += 1) act(() => result.current.increment())
    expect(result.current.quantity).toBe(5)
    expect(result.current.canIncrement).toBe(false)
    expect(result.current.canDecrement).toBe(true)

    act(() => result.current.decrement())
    expect(result.current.quantity).toBe(4)
  })

  it('clamps the quantity when switching to a smaller edition', () => {
    const { result } = renderHook(() => usePurchaseSelection([of50, of10]))
    for (let i = 0; i < 4; i += 1) act(() => result.current.increment())
    expect(result.current.quantity).toBe(5)

    act(() => result.current.selectEdition('e-1of10'))
    expect(result.current.edition?.id).toBe('e-1of10')
    expect(result.current.quantity).toBe(2)
    expect(result.current.canIncrement).toBe(false)

    // Switching back keeps the (now valid) value, it does not restore 5.
    act(() => result.current.selectEdition('e-1of50'))
    expect(result.current.quantity).toBe(2)
  })

  it('ignores sold-out and unknown editions', () => {
    const { result } = renderHook(() => usePurchaseSelection([unique(0), of10]))
    expect(result.current.edition?.id).toBe('e-1of10')
    act(() => result.current.selectEdition('e-1of1'))
    act(() => result.current.selectEdition('nope'))
    expect(result.current.edition?.id).toBe('e-1of10')
  })

  it('disables the stepper when every edition is sold out', () => {
    const { result } = renderHook(() => usePurchaseSelection([unique(0)]))
    expect(result.current.soldOut).toBe(true)
    expect(result.current.quantity).toBe(1)
    expect(result.current.canIncrement).toBe(false)
    expect(result.current.canDecrement).toBe(false)
    act(() => result.current.increment())
    expect(result.current.quantity).toBe(1)
  })

  it('re-clamps when a refetch lowers availability', () => {
    const { result, rerender } = renderHook(({ editions }) => usePurchaseSelection(editions), {
      initialProps: { editions: [of50] },
    })
    for (let i = 0; i < 4; i += 1) act(() => result.current.increment())
    expect(result.current.quantity).toBe(5)
    rerender({ editions: [{ ...of50, available: 2 }] })
    expect(result.current.quantity).toBe(2)
  })
})

describe('usePurchaseSelection: realtime sell-out', () => {
  it('falls back to an edition with stock when the selected one sells out', () => {
    const { result, rerender } = renderHook(({ editions }) => usePurchaseSelection(editions), {
      initialProps: { editions: [of10, of50] },
    })
    expect(result.current.edition?.id).toBe('e-1of10')
    rerender({ editions: [{ ...of10, available: 0 }, of50] })
    expect(result.current.edition?.id).toBe('e-1of50')
    expect(result.current.soldOut).toBe(false)
    rerender({ editions: [{ ...of10, available: 0 }, { ...of50, available: 0 }] })
    expect(result.current.soldOut).toBe(true)
  })
})
