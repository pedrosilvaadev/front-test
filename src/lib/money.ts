import Big from 'big.js'

/**
 * Decimal ETH arithmetic (ADR-003). ETH amounts travel and are stored as
 * canonical decimal strings ("1.19", "0.016", "26.846"); they are never
 * converted to JS numbers. All arithmetic goes through big.js.
 *
 * Invariants:
 *  - inputs are non-negative decimal strings with at most 18 fraction digits
 *    (wei precision), no sign, no exponent, no thousands separators;
 *  - results are canonical (`normalizeEth`): no exponent, no trailing zeros;
 *  - an operation that would produce a negative amount throws `MoneyError`.
 */

/** Wei precision: 1 ETH = 10^18 wei. */
export const ETH_DECIMALS = 18

/** Non-negative decimal with up to 18 fraction digits. `"01"`, `"1."`, `".5"`, `"1e3"` are rejected. */
export const ETH_AMOUNT_PATTERN = /^(0|[1-9]\d*)(\.\d{1,18})?$/

/** Percent string for discounts: 0–100 with up to 2 fraction digits. */
export const PERCENT_PATTERN = /^(0|[1-9]\d?|100)(\.\d{1,2})?$/

/** A decimal ETH amount as transported by the API (validated by `isEthAmount`). */
export type EthAmount = string

export type Comparison = -1 | 0 | 1

export class MoneyError extends Error {
  override readonly name = 'MoneyError'
}

/**
 * Isolated big.js constructor so global `Big` settings used elsewhere cannot
 * change our rounding. Strict mode makes big.js throw if a JS number is ever
 * passed in, which enforces the "no floats" rule at runtime.
 */
const Dec = Big()
Dec.strict = true
Dec.DP = ETH_DECIMALS
Dec.RM = Big.roundHalfUp
// Never use exponential notation in toString().
Dec.NE = -1_000_000
Dec.PE = 1_000_000

type Dec = InstanceType<typeof Dec>

export function isEthAmount(value: unknown): value is EthAmount {
  return typeof value === 'string' && ETH_AMOUNT_PATTERN.test(value)
}

function toDec(value: EthAmount, label = 'amount'): Dec {
  if (!isEthAmount(value)) {
    throw new MoneyError(`Invalid ETH ${label}: ${JSON.stringify(value)}`)
  }
  return new Dec(value)
}

function fromDec(value: Dec): EthAmount {
  if (value.lt('0')) throw new MoneyError('ETH amount cannot be negative')
  // round() guards against > 18 fraction digits; toFixed() never uses exponents.
  const fixed = value.round(ETH_DECIMALS, Big.roundHalfUp).toFixed()
  return fixed === '-0' ? '0' : fixed
}

function assertQuantity(quantity: number): void {
  if (!Number.isSafeInteger(quantity) || quantity < 0) {
    throw new MoneyError(`Quantity must be a non-negative integer, got ${String(quantity)}`)
  }
}

/** Canonical representation: `"1.190"` → `"1.19"`, `"0.0"` → `"0"`. */
export function normalizeEth(amount: EthAmount): EthAmount {
  return fromDec(toDec(amount))
}

export const ZERO_ETH: EthAmount = '0'

export function addEth(...amounts: EthAmount[]): EthAmount {
  return fromDec(amounts.reduce<Dec>((acc, a) => acc.plus(toDec(a)), new Dec('0')))
}

/** `a - b`; throws `MoneyError` when the result would be negative. */
export function subEth(a: EthAmount, b: EthAmount): EthAmount {
  const result = toDec(a).minus(toDec(b))
  if (result.lt('0')) throw new MoneyError('Subtraction would produce a negative ETH amount')
  return fromDec(result)
}

/** `max(a - b, 0)`; used when a discount exceeds the subtotal. */
export function subEthClamped(a: EthAmount, b: EthAmount): EthAmount {
  const result = toDec(a).minus(toDec(b))
  return result.lt('0') ? ZERO_ETH : fromDec(result)
}

/** Unit price × integer quantity. */
export function mulEth(amount: EthAmount, quantity: number): EthAmount {
  assertQuantity(quantity)
  return fromDec(toDec(amount).times(new Dec(String(quantity))))
}

/**
 * Discount amount for `percent` (string, 0–100, up to 2 decimals), rounded
 * half-up to 18 decimals. Example: `percentOfEth("26.83", "10")` → `"2.683"`.
 */
export function percentOfEth(amount: EthAmount, percent: string): EthAmount {
  if (!PERCENT_PATTERN.test(percent) || new Dec(percent).gt('100')) {
    throw new MoneyError(`Invalid percent: ${JSON.stringify(percent)}`)
  }
  return fromDec(toDec(amount).times(new Dec(percent)).div(new Dec('100')))
}

export function compareEth(a: EthAmount, b: EthAmount): Comparison {
  return toDec(a).cmp(toDec(b))
}

export const eqEth = (a: EthAmount, b: EthAmount): boolean => compareEth(a, b) === 0
export const gtEth = (a: EthAmount, b: EthAmount): boolean => compareEth(a, b) === 1
export const ltEth = (a: EthAmount, b: EthAmount): boolean => compareEth(a, b) === -1
export const isZeroEth = (a: EthAmount): boolean => toDec(a).eq('0')

export function minEth(a: EthAmount, b: EthAmount): EthAmount {
  return compareEth(a, b) <= 0 ? normalizeEth(a) : normalizeEth(b)
}

export function maxEth(a: EthAmount, b: EthAmount): EthAmount {
  return compareEth(a, b) >= 0 ? normalizeEth(a) : normalizeEth(b)
}

export interface FormatEthOptions {
  /** Minimum fraction digits shown (padding with zeros). Default 2. */
  minDecimals?: number
  /** Maximum fraction digits shown; rounded half-up. Default 4. */
  maxDecimals?: number
  /** Append the " ETH" unit. Default true. */
  unit?: boolean
}

/**
 * Display formatting: `"1.19"` → `"1.19 ETH"`, `"26.846"` → `"26.846 ETH"`,
 * `"2"` → `"2.00 ETH"`. Non-zero amounts that would round to zero render as
 * `"< 0.0001 ETH"` so a fee is never shown as free. Uses "." as decimal
 * separator to match the design.
 */
export function formatEth(amount: EthAmount, options: FormatEthOptions = {}): string {
  const { minDecimals = 2, maxDecimals = 4, unit = true } = options
  if (!Number.isInteger(minDecimals) || !Number.isInteger(maxDecimals) || minDecimals < 0 || maxDecimals < minDecimals || maxDecimals > ETH_DECIMALS) {
    throw new MoneyError('Invalid formatEth decimals')
  }
  const suffix = unit ? ' ETH' : ''
  const value = toDec(amount)
  const rounded = value.round(maxDecimals, Big.roundHalfUp)
  if (rounded.eq('0') && !value.eq('0')) {
    return `< ${new Dec('1').div(new Dec(`1${'0'.repeat(maxDecimals)}`)).toFixed(maxDecimals)}${suffix}`
  }
  // toFixed(maxDecimals) then trim trailing zeros down to minDecimals.
  let text = rounded.toFixed(maxDecimals)
  if (maxDecimals > minDecimals) {
    const [int, frac = ''] = text.split('.')
    const trimmed = frac.replace(/0+$/, '').padEnd(minDecimals, '0')
    text = trimmed.length > 0 ? `${int}.${trimmed}` : (int ?? '0')
  }
  return `${text}${suffix}`
}
