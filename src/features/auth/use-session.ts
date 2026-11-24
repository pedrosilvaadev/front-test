import { useQuery } from '@tanstack/react-query'
import { useRouteContext } from '@tanstack/react-router'
import { useEffect } from 'react'
import type { User } from '@/contracts'
import type { SessionManager } from './session-manager'

/** The app's session manager (router context). */
export function useSessionManager(): SessionManager {
  return useRouteContext({ from: '__root__', select: (context) => context.session })
}

export type SessionState =
  | { status: 'pending'; user: null }
  | { status: 'guest'; user: null }
  | { status: 'authenticated'; user: User }

/**
 * Current session for UI chrome (header, menus). `pending` while a stored
 * token is being revalidated, so nothing private (or a wrong "Entrar") flashes.
 * A failed revalidation (offline) keeps the visitor as guest in the chrome;
 * private routes surface the error through their guard.
 */
export function useSession(): SessionState {
  const manager = useSessionManager()
  const query = useQuery(manager.sessionQueryOptions())
  if (query.data) return { status: 'authenticated', user: query.data.user }
  if (query.isPending) return { status: 'pending', user: null }
  return { status: 'guest', user: null }
}

const APP_NAME = 'Kurio'

/** Sets `document.title` while mounted and restores the previous title afterwards. */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    const previous = document.title
    document.title = `${title} | ${APP_NAME}`
    return () => {
      document.title = previous
    }
  }, [title])
}

/** Up to two initials for the avatar fallback (`Kurio Collector` → `KC`). */
export function initials(name: string): string {
  const parts = name.trim().split(/[\s._-]+/).filter(Boolean)
  const letters = parts.length > 1 ? `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}` : (parts[0] ?? '').slice(0, 2)
  return letters.toUpperCase()
}
