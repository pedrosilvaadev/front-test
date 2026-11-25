import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useSession, useSessionManager } from '@/features/auth/use-session'
import { formatEth } from '@/lib/money'
import {
  applyNftUpdated,
  applyOrderUpdated,
  createEventDeduper,
  reconcileAfterReconnect,
} from './realtime-cache'
import { connectRealtime, type RealtimeConnectionState } from './realtime-connection'

/**
 * Owns the app's Socket.IO connection (P5-01). One socket per session: it is
 * created once the session is known and recreated whenever the user or token
 * changes (login, logout, user switch, expiry → guest socket). The previous
 * socket is disconnected with its listeners in the effect cleanup, so events
 * of a previous session can never reach the new one; `order.updated` is also
 * checked against the current user id.
 *
 * Renders the connection banner (only after a connection was lost) and a
 * polite live region announcing changes to what the user is looking at.
 */
export function RealtimeBridge() {
  const queryClient = useQueryClient()
  const manager = useSessionManager()
  const session = useSession()
  const [state, setState] = useState<RealtimeConnectionState>('connecting')
  const [announcement, setAnnouncement] = useState('')
  const announceSeq = useRef(0)

  const userId = session.user?.id ?? null
  const token = session.status === 'authenticated' ? manager.getToken() : null
  const ready = session.status !== 'pending'

  useEffect(() => {
    if (!ready) return
    const dedupe = createEventDeduper()
    const announce = (message: string) => {
      // Alternate a zero-width suffix so repeating the same text is announced again.
      announceSeq.current += 1
      setAnnouncement(`${message}${announceSeq.current % 2 ? '' : '​'}`)
    }
    const disconnect = connectRealtime({
      token,
      onStateChange: setState,
      onReconnected: () => reconcileAfterReconnect(queryClient, userId),
      onUnreadableEvent: () => reconcileAfterReconnect(queryClient, userId),
      onNftUpdated: (event) => {
        if (dedupe.seen(event.eventId)) return
        const outcome = applyNftUpdated(queryClient, event)
        if (!outcome.relevant) return
        const name = outcome.name ?? 'Um NFT'
        announce(
          event.data.totalAvailable === 0
            ? `${name} esgotou.`
            : `${name} foi atualizado: ${formatEth(event.data.price)}, ${event.data.totalAvailable} disponíveis.`,
        )
      },
      onOrderUpdated: (event) => {
        if (dedupe.seen(event.eventId)) return
        const outcome = applyOrderUpdated(queryClient, event, userId)
        if (outcome.status === 'confirmed') announce('Pagamento confirmado.')
        else if (outcome.status === 'declined') announce('Pagamento recusado.')
      },
    })
    return () => {
      disconnect()
      setState('connecting')
    }
  }, [ready, token, userId, queryClient])

  return (
    <>
      <div className="sr-only" aria-live="polite" aria-atomic="true" data-testid="realtime-announcer">
        {announcement}
      </div>
      <div data-testid="realtime-status" data-state={state} hidden={state !== 'reconnecting'}>
        {state === 'reconnecting' ? (
          <p
            role="status"
            className="pointer-events-none fixed inset-x-4 bottom-[calc(var(--tab-bar-height)+env(safe-area-inset-bottom)+0.75rem)] z-40 mx-auto max-w-md rounded-sm bg-card px-4 py-3 text-center text-sm text-foreground shadow-lg ring-1 ring-border md:bottom-6"
          >
            Atualizações em tempo real indisponíveis. Reconectando…
          </p>
        ) : null}
      </div>
    </>
  )
}
