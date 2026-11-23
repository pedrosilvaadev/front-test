import { z } from 'zod'
import {
  ethAmountSchema,
  idSchema,
  isoDateTimeSchema,
  versionSchema,
} from './common/primitives'
import { withOrderState } from './orders'

/**
 * Socket.IO events (README §7). Transport: `socket.io-client` against the
 * MSW Socket.IO binding (P5). Handshake `auth: { token }` (omit for guests);
 * the server joins `user:<id>` for private events. Every event is an envelope:
 *  - `eventId`: stable identity → duplicates are dropped;
 *  - `resource` + `version`: monotonic per resource → apply only if
 *    `version > cached version` (older/equal = stale, ignored);
 *  - `schemaVersion`: payload contract version (bump on breaking change; the
 *    client ignores unknown schema versions and reconciles via REST).
 */
export const REALTIME_SCHEMA_VERSION = 1

export const NFT_UPDATED = 'nft.updated'
export const ORDER_UPDATED = 'order.updated'

function envelope<TType extends string, TResource extends string, TData extends z.ZodType>(
  type: TType,
  resource: TResource,
  data: TData,
) {
  return z.object({
    eventId: z.uuid(),
    type: z.literal(type),
    schemaVersion: z.literal(REALTIME_SCHEMA_VERSION),
    resource: z.object({ type: z.literal(resource), id: idSchema }),
    version: versionSchema,
    occurredAt: isoDateTimeSchema,
    data,
  })
}

/** Broadcast to everyone. Carries the full new price/availability state, not a delta. */
export const nftUpdatedEventSchema = envelope(
  NFT_UPDATED,
  'nft',
  z.object({
    nftId: idSchema,
    price: ethAmountSchema,
    previousPrice: ethAmountSchema.nullable(),
    totalAvailable: z.int().min(0),
    editions: z.array(z.object({ editionId: idSchema, available: z.int().min(0) })),
  }),
)
export type NftUpdatedEvent = z.infer<typeof nftUpdatedEventSchema>

/**
 * Sent only to the owner's room. `userId` lets the client drop events that
 * belong to a previous session (README §7 "Eventos de uma sessão anterior...").
 */
export const orderUpdatedEventSchema = envelope(
  ORDER_UPDATED,
  'order',
  // Same status ↔ transaction/decline invariants as `Order`.
  withOrderState({
    orderId: idSchema,
    userId: idSchema,
    updatedAt: isoDateTimeSchema,
  }),
)
export type OrderUpdatedEvent = z.infer<typeof orderUpdatedEventSchema>

/** Typed maps for `io()` from socket.io-client: `Socket<ServerToClientEvents, ClientToServerEvents>`. */
export interface ServerToClientEvents {
  [NFT_UPDATED]: (event: NftUpdatedEvent) => void
  [ORDER_UPDATED]: (event: OrderUpdatedEvent) => void
}

/** No client → server events are required; reconciliation uses REST. */
export type ClientToServerEvents = Record<string, never>

/** Socket.IO handshake auth payload. */
export interface SocketAuth {
  token?: string
}

/**
 * Pure decision helper shared by the realtime layer and its tests: should an
 * event with `incoming` version be applied over `current`?
 */
export function isNewerVersion(incoming: number, current: number | undefined): boolean {
  return current === undefined || incoming > current
}
