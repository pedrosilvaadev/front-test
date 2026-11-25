import { ws } from 'msw'
import type { WebSocketClientConnectionProtocol } from '@mswjs/interceptors/WebSocket'
import {
  NFT_UPDATED,
  ORDER_UPDATED,
  REALTIME_SCHEMA_VERSION,
  type NftDetail,
  type NftUpdatedEvent,
  type Order,
  type OrderUpdatedEvent,
} from '@/contracts'
import { subscribeDbCommits, type OrderRecord } from './db'
import { authenticateToken, randomHex } from './sessions'

/**
 * Socket.IO server simulation (P5-01, docs/API_CONTRACTS.md "Realtime").
 *
 * The app uses the real `socket.io-client` over its `websocket` transport;
 * MSW intercepts that WebSocket in the page and this module speaks the wire
 * protocol (Engine.IO v4 + Socket.IO v5, text packets, default namespace):
 *
 *   server → `0{open}`            Engine.IO handshake (sid, ping settings)
 *   client → `40{auth}`           Socket.IO CONNECT with `{ token? }`
 *   server → `40{sid}` | `44{message}`  connected | CONNECT_ERROR (bad token)
 *   server → `2` / client → `3`   heartbeat (ping/pong)
 *   server → `42["event",payload]` events
 *   client → `41`                 DISCONNECT
 *
 * Events come from db commits (`subscribeDbCommits`): an NFT whose version
 * grew → `nft.updated` broadcast; an order whose version grew →
 * `order.updated` to the owner's room (`user:<id>` = sockets authenticated as
 * that user). Guests only receive public events.
 *
 * Limitations (mock only): one namespace, no binary/acks/client events, no
 * HTTP long-polling (the client is configured with `transports: ['websocket']`),
 * no connection-state recovery (missed events are reconciled over REST), and
 * each tab runs its own server, so a change made in another tab reaches this
 * tab over REST only.
 */

export const PING_INTERVAL_MS = 25_000
export const PING_TIMEOUT_MS = 20_000

/**
 * Matches `ws(s)://<any host>/realtime/socket.io/?EIO=4&transport=websocket`
 * (`REALTIME_SOCKET_PATH`). A dedicated path, because MSW strips a leading
 * `/socket.io/` before matching and the bare origin would also capture the
 * Vite HMR socket in development. Other WebSockets pass through.
 */
const realtimeLink = ws.link(/\/realtime\/socket\.io\/?$/)

interface RealtimeSocket {
  client: WebSocketClientConnectionProtocol
  sid: string
  /** `undefined` until the Socket.IO CONNECT packet was accepted; `null` = guest. */
  userId: string | null | undefined
  pingTimer: ReturnType<typeof setInterval>
}

const sockets = new Set<RealtimeSocket>()
let online = true

/** Engine.IO message (`4`) carrying a Socket.IO packet. */
function sendPacket(socket: RealtimeSocket, socketIoPacket: string): void {
  socket.client.send(`4${socketIoPacket}`)
}

function emitTo(socket: RealtimeSocket, event: string, payload: unknown): void {
  sendPacket(socket, `2${JSON.stringify([event, payload])}`)
}

function closeSocket(socket: RealtimeSocket): void {
  clearInterval(socket.pingTimer)
  sockets.delete(socket)
  try {
    socket.client.close()
  } catch {
    // already closed
  }
}

function parseConnectAuth(packet: string): unknown {
  // `0` + optional `/nsp,` + optional JSON auth payload.
  const body = packet.slice(1).replace(/^\/[^,]*,/, '')
  if (body === '') return {}
  try {
    return JSON.parse(body)
  } catch {
    return undefined
  }
}

async function handleConnect(socket: RealtimeSocket, packet: string): Promise<void> {
  const auth = parseConnectAuth(packet)
  const token = typeof auth === 'object' && auth !== null && 'token' in auth ? auth.token : undefined
  if (token === undefined || token === null) {
    socket.userId = null
  } else {
    const result = typeof token === 'string' && token !== '' ? await authenticateToken(token) : undefined
    if (!result?.ok) {
      sendPacket(socket, `4${JSON.stringify({ message: result?.code ?? 'UNAUTHORIZED' })}`)
      return
    }
    socket.userId = result.record.user.id
  }
  if (!sockets.has(socket)) return
  sendPacket(socket, `0${JSON.stringify({ sid: socket.sid })}`)
}

function handleMessage(socket: RealtimeSocket, raw: unknown): void {
  if (typeof raw !== 'string' || raw === '') return
  const engineType = raw[0]
  if (engineType === '3') return // pong
  if (engineType === '1') {
    closeSocket(socket)
    return
  }
  if (engineType !== '4') return
  const packet = raw.slice(1)
  if (packet[0] === '0') void handleConnect(socket, packet)
  else if (packet[0] === '1') closeSocket(socket)
  // Client → server events are not part of the contract; ignored.
}

export const realtimeHandlers = [
  realtimeLink.addEventListener('connection', ({ client }) => {
    if (!online) {
      // Simulated outage: refuse; socket.io-client retries with backoff.
      client.close()
      return
    }
    const sid = randomHex(10)
    const socket: RealtimeSocket = {
      client,
      sid,
      userId: undefined,
      pingTimer: setInterval(() => client.send('2'), PING_INTERVAL_MS),
    }
    sockets.add(socket)
    client.addEventListener('message', (event) => handleMessage(socket, event.data))
    client.addEventListener('close', () => {
      clearInterval(socket.pingTimer)
      sockets.delete(socket)
    })
    client.send(
      `0${JSON.stringify({ sid, upgrades: [], pingInterval: PING_INTERVAL_MS, pingTimeout: PING_TIMEOUT_MS, maxPayload: 1_000_000 })}`,
    )
  }),
]

function connected(): RealtimeSocket[] {
  return [...sockets].filter((socket) => socket.userId !== undefined)
}

/** Broadcast (`nft.updated`) or room delivery (`order.updated` → `user:<userId>`). Returns the recipients count. */
export function publishEvent(event: NftUpdatedEvent | OrderUpdatedEvent): number {
  const recipients = connected().filter((socket) => event.type === NFT_UPDATED || socket.userId === event.data.userId)
  for (const socket of recipients) emitTo(socket, event.type, event)
  return recipients.length
}

export function nftUpdatedEvent(nft: NftDetail, now = Date.now()): NftUpdatedEvent {
  return {
    eventId: crypto.randomUUID(),
    type: NFT_UPDATED,
    schemaVersion: REALTIME_SCHEMA_VERSION,
    resource: { type: 'nft', id: nft.id },
    version: nft.version,
    occurredAt: new Date(now).toISOString(),
    data: {
      nftId: nft.id,
      price: nft.price,
      previousPrice: nft.previousPrice,
      totalAvailable: nft.totalAvailable,
      editions: nft.editions.map((edition) => ({ editionId: edition.id, available: edition.available })),
    },
  }
}

export function orderUpdatedEvent(userId: string, order: Order, now = Date.now()): OrderUpdatedEvent {
  const base = {
    eventId: crypto.randomUUID(),
    type: ORDER_UPDATED,
    schemaVersion: REALTIME_SCHEMA_VERSION,
    resource: { type: 'order', id: order.id },
    version: order.version,
    occurredAt: new Date(now).toISOString(),
  } as const
  const common = { orderId: order.id, userId, updatedAt: order.updatedAt }
  switch (order.status) {
    case 'pending':
      return { ...base, data: { ...common, status: 'pending', transaction: null, decline: null } }
    case 'confirmed':
      return { ...base, data: { ...common, status: 'confirmed', transaction: order.transaction, decline: null } }
    case 'declined':
      return { ...base, data: { ...common, status: 'declined', transaction: null, decline: order.decline } }
  }
}

function publishOrder(record: OrderRecord): void {
  publishEvent(orderUpdatedEvent(record.userId, record.order))
}

subscribeDbCommits((commit) => {
  for (const nft of commit.nfts) publishEvent(nftUpdatedEvent(nft))
  for (const record of commit.orders) publishOrder(record)
})

export interface RealtimeStatus {
  online: boolean
  connections: { userId: string | null }[]
}

export function getRealtimeStatus(): RealtimeStatus {
  return { online, connections: connected().map((socket) => ({ userId: socket.userId ?? null })) }
}

/**
 * Dev control: `false` drops every socket and refuses new connections (the
 * client keeps retrying); `true` accepts them again. Events produced while
 * offline are lost, like on a real outage.
 */
export function setRealtimeOnline(next: boolean): RealtimeStatus {
  online = next
  if (!next) for (const socket of [...sockets]) closeSocket(socket)
  return getRealtimeStatus()
}

/** Back to the initial state (online). Open sockets are kept. */
export function resetRealtime(): void {
  online = true
}
