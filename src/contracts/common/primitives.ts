import { z } from 'zod'
import { ETH_AMOUNT_PATTERN, PERCENT_PATTERN } from '@/lib/money'

/**
 * Shared primitives for every resource contract (ADR-002). ETH amounts are
 * canonical decimal strings, never JS numbers (ADR-003).
 */

/** Non-negative ETH amount as a decimal string with up to 18 fraction digits. */
export const ethAmountSchema = z
  .string()
  .regex(ETH_AMOUNT_PATTERN, 'Expected a non-negative decimal ETH string with up to 18 decimals')

/** Discount percent as a decimal string, 0–100 with up to 2 decimals. */
export const percentSchema = z
  .string()
  .regex(PERCENT_PATTERN, 'Expected a percent string between 0 and 100')

/** All prices are quoted in ETH regardless of the NFT network (simulation simplification). */
export const currencySchema = z.literal('ETH')

/** Opaque, non-empty server identifier. */
export const idSchema = z.string().min(1).max(128)

/** ISO-8601 UTC timestamp, e.g. `2026-07-29T12:00:00.000Z`. */
export const isoDateTimeSchema = z.iso.datetime()

/** Upper bound for any single cart line quantity (availability is enforced server side). */
export const MAX_LINE_QUANTITY = 999

/** Positive integer quantity (never fractional). */
export const quantitySchema = z.int().min(1).max(MAX_LINE_QUANTITY)

/** Monotonic per-resource version used for realtime ordering and stale-event protection. */
export const versionSchema = z.int().min(0)

export const NETWORKS = ['ethereum', 'polygon', 'solana'] as const
export const networkSchema = z.enum(NETWORKS)
export type Network = z.infer<typeof networkSchema>

/** Image reference. Width/height are intrinsic pixels so the UI can reserve space (no CLS). */
export const imageSchema = z.object({
  url: z.string().min(1),
  alt: z.string(),
  width: z.int().positive(),
  height: z.int().positive(),
})
export type Image = z.infer<typeof imageSchema>

/** EVM address (Ethereum, Polygon). */
export const EVM_ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/
/** Solana base58 public key. */
export const SOLANA_ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/

export function isAddressForNetwork(address: string, network: Network): boolean {
  return network === 'solana'
    ? SOLANA_ADDRESS_PATTERN.test(address)
    : EVM_ADDRESS_PATTERN.test(address)
}

/** Simulated transaction hash (EVM style: 0x + 64 hex). */
export const txHashSchema = z.string().regex(/^0x[a-fA-F0-9]{64}$/)

/** `Idempotency-Key` header value: a client generated UUID. */
export const idempotencyKeySchema = z.uuid()

/** Guest cart identifier (client generated UUID, sent as `X-Guest-Cart-Id`). */
export const guestCartIdSchema = z.uuid()

/** ENS name, e.g. `kurio-collector.eth`. Normalized to lower case. */
export const ensNameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9-]{3,63}\.eth$/, 'Expected an ENS name ending in .eth')

/** Email, trimmed and lower-cased. */
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254))

/** Public handle: 3–24 chars, lowercase letters, digits, `_` and `.`. */
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_.]{3,24}$/, 'Use 3-24 letters, digits, "_" or "."')

export const displayNameSchema = z.string().trim().min(2).max(50)

/** Password policy: 8–72 chars with at least one letter and one digit. */
export const passwordSchema = z
  .string()
  .min(8)
  .max(72)
  .regex(/[A-Za-z]/, 'Must contain a letter')
  .regex(/\d/, 'Must contain a digit')

/** Referral code shown on the payment/wallet forms: 4–12 alphanumerics, upper-cased. */
export const referralCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{4,12}$/, 'Use 4-12 letters or digits')
