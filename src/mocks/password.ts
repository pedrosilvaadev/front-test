/**
 * MOCK-ONLY password hashing (ADR-005). Salted SHA-256 via Web Crypto so the
 * simulated server never stores plaintext passwords. This is NOT a production
 * password hash (no key stretching: use argon2/bcrypt/scrypt on a real server).
 */
export async function hashPassword(password: string, salt: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${salt}:${password}`)
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Constant-time-ish comparison; good enough for a simulation, kept for hygiene. */
export async function verifyPassword(password: string, salt: string, expectedHash: string): Promise<boolean> {
  const actual = await hashPassword(password, salt)
  if (actual.length !== expectedHash.length) return false
  let diff = 0
  for (let i = 0; i < actual.length; i += 1) diff |= actual.charCodeAt(i) ^ expectedHash.charCodeAt(i)
  return diff === 0
}
