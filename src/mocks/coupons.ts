import type { AppliedCoupon } from '@/contracts'

/**
 * Deterministic mock coupons (P4-01). Codes are case-insensitive and
 * normalized to upper case by `applyCouponRequestSchema`.
 *
 * | Code         | Effect                                   |
 * |--------------|------------------------------------------|
 * | `KURIO10`    | 10% off the subtotal (half-up at 18 dp)  |
 * | `LANCAMENTO` | 0.5 ETH off, capped at the subtotal      |
 * | `EXPIRADO`   | expired → 422 `COUPON_EXPIRED`           |
 * | anything else| 422 `COUPON_INVALID`                     |
 *
 * Expiry is checked against the request time, so a coupon could also be
 * invalidated between quotes (reported as `coupon_invalidated`).
 */
interface CouponDefinition {
  coupon: AppliedCoupon
  /** ISO timestamp after which the coupon is rejected; null = no expiry. */
  expiresAt: string | null
}

const COUPONS: Readonly<Record<string, CouponDefinition>> = {
  KURIO10: {
    coupon: { code: 'KURIO10', kind: 'percent', percent: '10', label: '10% de desconto' },
    expiresAt: null,
  },
  LANCAMENTO: {
    coupon: { code: 'LANCAMENTO', kind: 'fixed', amount: '0.5', label: '0.5 ETH de desconto' },
    expiresAt: null,
  },
  EXPIRADO: {
    coupon: { code: 'EXPIRADO', kind: 'percent', percent: '50', label: '50% de desconto' },
    expiresAt: '2025-01-01T00:00:00.000Z',
  },
}

export type CouponLookup =
  | { ok: true; coupon: AppliedCoupon }
  | { ok: false; code: 'COUPON_INVALID' | 'COUPON_EXPIRED' }

/** Definition of a known code regardless of expiry (a stored code is shown on the cart until removed). */
export function couponDefinition(code: string): AppliedCoupon | null {
  const definition = Object.hasOwn(COUPONS, code) ? COUPONS[code] : undefined
  return definition ? structuredClone(definition.coupon) : null
}

/** Resolves a normalized (upper-case) code at `now`. */
export function lookupCoupon(code: string, now = Date.now()): CouponLookup {
  const definition = Object.hasOwn(COUPONS, code) ? COUPONS[code] : undefined
  if (!definition) return { ok: false, code: 'COUPON_INVALID' }
  if (definition.expiresAt !== null && Date.parse(definition.expiresAt) <= now) {
    return { ok: false, code: 'COUPON_EXPIRED' }
  }
  return { ok: true, coupon: structuredClone(definition.coupon) }
}
