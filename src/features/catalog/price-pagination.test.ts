import { describe, expect, it } from 'vitest'
import { pageItems } from './pagination'
import { centsToEth, ethToCents, formatPriceBound } from './price'

describe('price slider helpers', () => {
  it('converts ETH strings to integer hundredths without floats', () => {
    expect(ethToCents('0.02', 'floor')).toBe(2)
    expect(ethToCents('12.30', 'floor')).toBe(1230)
    expect(ethToCents('1', 'ceil')).toBe(100)
    expect(ethToCents('0.015', 'floor')).toBe(1)
    expect(ethToCents('0.015', 'ceil')).toBe(2)
    expect(ethToCents('0.010000000000000000', 'ceil')).toBe(1)
    expect(ethToCents('0.000000000000000001', 'ceil')).toBe(1)
  })

  it('returns null instead of throwing for unsafe or invalid amounts', () => {
    expect(ethToCents('1' + '0'.repeat(20), 'floor')).toBeNull()
    expect(ethToCents('90071992547409.93', 'ceil')).toBeNull()
    expect(ethToCents('-1', 'floor')).toBeNull()
    expect(ethToCents('abc', 'floor')).toBeNull()
  })

  it('converts hundredths back to canonical ETH strings', () => {
    expect(centsToEth(0)).toBe('0')
    expect(centsToEth(2)).toBe('0.02')
    expect(centsToEth(129)).toBe('1.29')
    expect(centsToEth(1230)).toBe('12.3')
    expect(() => centsToEth(-1)).toThrow(RangeError)
    expect(() => centsToEth(1.5)).toThrow(RangeError)
  })

  it('formats bounds like the frame ("0,02 - 12,30")', () => {
    expect(formatPriceBound('0.02')).toBe('0,02')
    expect(formatPriceBound('12.3')).toBe('12,30')
  })
})

describe('pageItems', () => {
  it('lists every page up to 7', () => {
    expect(pageItems(1, 0)).toEqual([])
    expect(pageItems(1, 1)).toEqual([1])
    expect(pageItems(2, 6)).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('windows around the current page with gaps', () => {
    expect(pageItems(1, 10)).toEqual([1, 2, 3, 4, 5, 'gap-end', 10])
    expect(pageItems(5, 10)).toEqual([1, 'gap-start', 4, 5, 6, 'gap-end', 10])
    expect(pageItems(10, 10)).toEqual([1, 'gap-start', 6, 7, 8, 9, 10])
    expect(pageItems(99, 10)).toEqual([1, 'gap-start', 6, 7, 8, 9, 10])
  })
})
