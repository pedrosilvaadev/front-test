import type { Socket } from 'socket.io-client'
import {
  NFT_UPDATED,
  nftUpdatedEventSchema,
  ORDER_UPDATED,
  orderUpdatedEventSchema,
  REALTIME_SCHEMA_VERSION,
  type ClientToServerEvents,
  type NftUpdatedEvent,
  type OrderUpdatedEvent,
  type ServerToClientEvents,
  type SocketAuth,
} from '@/contracts'

/** `connecting` (first attempt), `connected`, `reconnecting` (lost after a connection), `offline` (refused by the server). */
export type RealtimeConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'offline'

export interface RealtimeHandlers {
  onNftUpdated: (event: NftUpdatedEvent) => void
  onOrderUpdated: (event: OrderUpdatedEvent) => void
  /** Connected again after a drop: events may have been missed → reconcile over REST. */
  onReconnected: () => void
  /** Event with an unknown `schemaVersion` or an invalid payload → reconcile over REST. */
  onUnreadableEvent: () => void
  onStateChange: (state: RealtimeConnectionState) => void
}

export interface RealtimeConnectionOptions extends RealtimeHandlers {
  /** Bearer token of the session; omitted for guests (public events only). */
  token: string | null
  /** Defaults to the page origin (MSW intercepts the WebSocket in mocks). */
  url?: string
}

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>

/** Socket.IO `path` (Engine.IO endpoint) of the realtime server (mocked by MSW). */
export const REALTIME_SOCKET_PATH = '/realtime/socket.io/'

/** Reconnection backoff: 0.5 s → 2 s (±20 %), unlimited attempts. */
export const RECONNECT_OPTIONS = { reconnectionDelay: 500, reconnectionDelayMax: 2000, randomizationFactor: 0.2 } as const

function readable<T>(schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false } }, payload: unknown): T | undefined {
  const schemaVersion =
    typeof payload === 'object' && payload !== null && 'schemaVersion' in payload ? payload.schemaVersion : undefined
  if (schemaVersion !== REALTIME_SCHEMA_VERSION) return undefined
  const parsed = schema.safeParse(payload)
  return parsed.success ? parsed.data : undefined
}

/**
 * One Socket.IO connection for one session (docs/API_CONTRACTS.md
 * "Realtime"). `socket.io-client` is loaded on demand (own chunk). Returns
 * `disconnect`, which removes every listener and closes the socket; it is
 * safe to call before the client finished loading.
 */
export function connectRealtime(options: RealtimeConnectionOptions): () => void {
  let socket: AppSocket | undefined
  let disposed = false
  let hasConnected = false

  void import('socket.io-client').then(({ io }) => {
    if (disposed) return
    const auth: SocketAuth = options.token ? { token: options.token } : {}
    const client: AppSocket = io(options.url ?? '', {
      path: REALTIME_SOCKET_PATH,
      transports: ['websocket'],
      auth,
      ...RECONNECT_OPTIONS,
      timeout: 5000,
    })
    socket = client
    options.onStateChange('connecting')

    client.on('connect', () => {
      options.onStateChange('connected')
      if (hasConnected) options.onReconnected()
      hasConnected = true
    })
    client.on('disconnect', (reason) => {
      // `io client disconnect` = our own `disconnect()`; otherwise the manager retries.
      if (reason !== 'io client disconnect') options.onStateChange(hasConnected ? 'reconnecting' : 'connecting')
    })
    client.on('connect_error', () => {
      // `active` false = refused by the server (e.g. CONNECT_ERROR for a bad token): no retry.
      options.onStateChange(client.active ? (hasConnected ? 'reconnecting' : 'connecting') : 'offline')
    })
    client.on(NFT_UPDATED, (payload: unknown) => {
      const event = readable<NftUpdatedEvent>(nftUpdatedEventSchema, payload)
      if (event) options.onNftUpdated(event)
      else options.onUnreadableEvent()
    })
    client.on(ORDER_UPDATED, (payload: unknown) => {
      const event = readable<OrderUpdatedEvent>(orderUpdatedEventSchema, payload)
      if (event) options.onOrderUpdated(event)
      else options.onUnreadableEvent()
    })
  })

  return () => {
    disposed = true
    if (!socket) return
    socket.removeAllListeners()
    socket.disconnect()
    socket = undefined
  }
}
