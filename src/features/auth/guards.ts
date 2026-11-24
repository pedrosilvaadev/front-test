import { redirect } from '@tanstack/react-router'
import { sanitizeRedirect, type AuthSearch } from './redirect'
import type { SessionManager } from './session-manager'

/**
 * `beforeLoad` of `/login` and `/cadastro`: a signed-in visitor goes to the
 * (already sanitized) redirect target. A failed session check (offline)
 * leaves the auth page usable.
 */
export async function redirectSignedIn(session: SessionManager, search: AuthSearch): Promise<void> {
  let signedIn: boolean
  try {
    signedIn = (await session.ensureSession()) !== null
  } catch {
    signedIn = false
  }
  if (signedIn) throw redirect({ href: sanitizeRedirect(search.redirect ?? '/'), replace: true })
}
