import { formatEth, normalizeEth, type EthAmount } from '@/lib/money'

/**
 * Price slider helpers. The slider works on integer hundredths of ETH
 * ("centi-ETH") so no ETH value is ever represented as a float: conversion is
 * done on the decimal string. These integers are slider positions, not money
 * arithmetic.
 */
const STEP_DECIMALS = 2

/**
 * Canonical ETH string → integer hundredths, rounding any remainder down or
 * up. Returns `null` (never throws) when the amount is invalid or too large to
 * be a safe slider position; callers then disable the slider.
 */
export function ethToCents(amount: EthAmount, mode: 'floor' | 'ceil'): number | null {
  let canonical: string
  try {
    canonical = normalizeEth(amount)
  } catch {
    return null
  }
  const [int = '0', frac = ''] = canonical.split('.')
  const cents = Number(int) * 100 + Number(frac.padEnd(STEP_DECIMALS, '0').slice(0, STEP_DECIMALS))
  const remainder = frac.slice(STEP_DECIMALS)
  const result = mode === 'ceil' && /[1-9]/.test(remainder) ? cents + 1 : cents
  return Number.isSafeInteger(result) ? result : null
}

/** Integer hundredths → canonical ETH string (`129` → `"1.29"`, `1230` → `"12.3"`). */
export function centsToEth(cents: number): EthAmount {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new RangeError(`Invalid cents: ${String(cents)}`)
  const int = Math.floor(cents / 100)
  const frac = String(cents % 100).padStart(STEP_DECIMALS, '0')
  return normalizeEth(`${String(int)}.${frac}`)
}

/** Sidebar label format from the frame ("Preço: 0,02 - 12,30 ETH"): `"12.3"` → `"12,30"`. */
export function formatPriceBound(amount: EthAmount): string {
  return formatEth(amount, { minDecimals: 2, maxDecimals: 2, unit: false }).replace('.', ',')
}
