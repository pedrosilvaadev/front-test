import { z } from 'zod'
import { isoDateTimeSchema, userSchema } from '@/contracts'

/**
 * Simulated server-side user records. Passwords are stored as salted SHA-256
 * hashes (see `../password.ts`, mock only); plaintext is never stored in the db.
 */
export const userRecordSchema = z.object({
  user: userSchema,
  passwordSalt: z.string().regex(/^[0-9a-f]+$/),
  passwordHash: z.string().regex(/^[0-9a-f]{64}$/),
  createdAt: isoDateTimeSchema,
})
export type UserRecord = z.infer<typeof userRecordSchema>

/**
 * FICTITIOUS demo credentials for local development, tests and E2E only.
 * They do not belong to any real person or service. The db only keeps the
 * hashes below (a unit test asserts they match these passwords).
 */
export const DEMO_CREDENTIALS = {
  collector: { email: 'colecionador@kurio.test', password: 'Colecionador2026' },
  creator: { email: 'nova@kurio.test', password: 'NovaSato2026' },
} as const

export const SEED_USERS: readonly UserRecord[] = [
  {
    user: {
      id: 'usr_001',
      username: 'kurio.collector',
      email: DEMO_CREDENTIALS.collector.email,
      displayName: 'Kurio Collector',
      avatarUrl: null,
    },
    passwordSalt: '6b75726f2d73616c742d7531',
    passwordHash: 'ba26db0744b0084f236082e5d574bd400369a9e3409c16b7163b2df13f5f5d4c',
    createdAt: '2026-09-01T12:00:00.000Z',
  },
  {
    user: {
      id: 'usr_002',
      username: 'nova.sato',
      email: DEMO_CREDENTIALS.creator.email,
      displayName: 'Nova Sato',
      avatarUrl: null,
    },
    passwordSalt: '6b75726f2d73616c742d7532',
    passwordHash: '61d10ebb98cfb872defd06cf292e329ee355152db4c38f20a64beed67ca318c2',
    createdAt: '2026-09-15T12:00:00.000Z',
  },
]
