import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import {
  nftUpdatedEventSchema,
  orderUpdatedEventSchema,
  type NftDetail,
  type NftUpdatedEvent,
  type Order,
} from '@/contracts'
import { queryKeys } from '@/lib/query-keys'
import { toSummary } from '@/mocks/catalog'
import { createNftSeed } from '@/mocks/fixtures/nfts'
import { nftUpdatedEvent, orderUpdatedEvent } from '@/mocks/realtime-server'
import { applyNftUpdated, applyOrderUpdated, createEventDeduper, reconcileAfterReconnect } from './realtime-cache'

const seed = createNftSeed()
const ape = seed.find((nft) => nft.id === 'nft_001') as NftDetail
const other = seed.find((nft) => nft.id !== 'nft_001') as NftDetail

function nftEvent(version: number, price: string, firstAvailable?: number): NftUpdatedEvent {
  const editions = ape.editions.map((edition, index) =>
    index === 0 && firstAvailable !== undefined ? { ...edition, available: firstAvailable } : edition,
  )
  return nftUpdatedEvent({ ...ape, price, version, editions, totalAvailable: editions.reduce((sum, e) => sum + e.available, 0) })
}

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
}

describe('applyNftUpdated', () => {
  it('builds events that satisfy the realtime contract', () => {
    expect(nftUpdatedEventSchema.safeParse(nftEvent(2, '2')).success).toBe(true)
  })

  it('patches detail, lists and featured copies when the event is newer', () => {
    const qc = client()
    const listKey = ['catalog', 'list', { page: 1 }]
    qc.setQueryData(queryKeys.catalog.detail('emerald-ape-042'), ape)
    qc.setQueryData(listKey, { items: [toSummary(ape), toSummary(other)], total: 2 })
    qc.setQueryData(queryKeys.catalog.featured(), [toSummary(ape)])
    const before = qc.getQueryData<{ items: unknown[] }>(listKey)

    const outcome = applyNftUpdated(qc, nftEvent(2, '2.5', 0))

    expect(outcome).toMatchObject({ applied: true, inCart: false, name: 'Emerald Ape #042' })
    const detail = qc.getQueryData<NftDetail>(queryKeys.catalog.detail('emerald-ape-042'))
    expect(detail).toMatchObject({ price: '2.5', version: 2 })
    expect(detail?.editions[0]?.available).toBe(0)
    const list = qc.getQueryData<{ items: NftDetail[] }>(listKey)
    expect(list?.items[0]).toMatchObject({ price: '2.5', version: 2 })
    // Unrelated items keep their reference (no needless re-render).
    expect(list?.items[1]).toBe(before?.items[1])
    expect(qc.getQueryData<NftDetail[]>(queryKeys.catalog.featured())?.[0]?.price).toBe('2.5')
    // Lists are marked stale (filters/sort depend on price/stock).
    expect(qc.getQueryState(listKey)?.isInvalidated).toBe(true)
  })

  it('ignores stale and equal versions', () => {
    const qc = client()
    qc.setQueryData(queryKeys.catalog.detail('nft_001'), { ...ape, version: 5, price: '9' })
    const before = qc.getQueryData(queryKeys.catalog.detail('nft_001'))
    expect(applyNftUpdated(qc, nftEvent(5, '1')).applied).toBe(false)
    expect(applyNftUpdated(qc, nftEvent(4, '1')).applied).toBe(false)
    expect(qc.getQueryData(queryKeys.catalog.detail('nft_001'))).toBe(before)
    expect(applyNftUpdated(qc, nftEvent(6, '1')).applied).toBe(true)
  })

  it('invalidates the cart and its quote only when the NFT is in the cart', () => {
    const cartKey = queryKeys.cart.owner('user:usr_001')
    const quoteKey = queryKeys.cart.quote('user:usr_001', { network: 'ethereum', cartVersion: 1 })
    const qc = client()
    qc.setQueryData(cartKey, { version: 1, items: [{ nftId: 'nft_001', quantity: 1 }] })
    qc.setQueryData(quoteKey, { quoteId: 'qt_1', lines: [{ nftId: 'nft_001' }] })
    expect(applyNftUpdated(qc, nftEvent(2, '2')).inCart).toBe(true)
    expect(qc.getQueryState(cartKey)?.isInvalidated).toBe(true)
    expect(qc.getQueryState(quoteKey)?.isInvalidated).toBe(true)

    const qc2 = client()
    qc2.setQueryData(cartKey, { version: 1, items: [{ nftId: other.id, quantity: 1 }] })
    expect(applyNftUpdated(qc2, nftEvent(2, '2')).inCart).toBe(false)
    expect(qc2.getQueryState(cartKey)?.isInvalidated).toBe(false)
  })
})

const HASH = `0x${'a'.repeat(64)}`
const pending = {
  id: 'ord_1',
  status: 'pending',
  transaction: null,
  decline: null,
  updatedAt: '2026-11-25T10:00:00.000Z',
  version: 1,
  receipt: { total: '1.016' },
} as unknown as Order
const withState = (version: number, status: Order['status']): Order =>
  ({
    ...pending,
    version,
    status,
    transaction: status === 'confirmed' ? { hash: HASH, explorerUrl: `https://etherscan.io/tx/${HASH}` } : null,
    decline: status === 'declined' ? { reason: 'PAYMENT_DECLINED', message: 'Recusado.' } : null,
  }) as Order

describe('applyOrderUpdated', () => {
  const key = queryKeys.user.order('usr_001', 'ord_1')

  it('builds events that satisfy the realtime contract', () => {
    expect(orderUpdatedEventSchema.safeParse(orderUpdatedEvent('usr_001', withState(2, 'confirmed'))).success).toBe(true)
    expect(orderUpdatedEventSchema.safeParse(orderUpdatedEvent('usr_001', withState(2, 'declined'))).success).toBe(true)
  })

  it('patches the current user order when newer and refreshes the cart on confirmation', () => {
    const qc = client()
    qc.setQueryData(key, pending)
    const cartKey = queryKeys.cart.owner('user:usr_001')
    qc.setQueryData(cartKey, { version: 1, items: [] })
    expect(applyOrderUpdated(qc, orderUpdatedEvent('usr_001', withState(2, 'confirmed')), 'usr_001')).toEqual({
      applied: true,
      status: 'confirmed',
    })
    // The receipt is never touched by events.
    expect(qc.getQueryData<Order>(key)).toMatchObject({ status: 'confirmed', version: 2, receipt: { total: '1.016' } })
    expect(qc.getQueryState(cartKey)?.isInvalidated).toBe(true)
  })

  it('drops events of another user (previous session) and for guests', () => {
    const qc = client()
    qc.setQueryData(key, pending)
    const event = orderUpdatedEvent('usr_002', withState(2, 'confirmed'))
    expect(applyOrderUpdated(qc, event, 'usr_001').applied).toBe(false)
    expect(applyOrderUpdated(qc, event, null).applied).toBe(false)
    expect(qc.getQueryData<Order>(key)?.status).toBe('pending')
  })

  it('never regresses a terminal state, even with a higher version', () => {
    const qc = client()
    qc.setQueryData(key, withState(2, 'confirmed'))
    expect(applyOrderUpdated(qc, orderUpdatedEvent('usr_001', withState(3, 'declined')), 'usr_001').applied).toBe(false)
    expect(applyOrderUpdated(qc, orderUpdatedEvent('usr_001', withState(4, 'pending')), 'usr_001').applied).toBe(false)
    expect(qc.getQueryData<Order>(key)?.status).toBe('confirmed')
  })

  it('ignores stale versions', () => {
    const qc = client()
    qc.setQueryData(key, { ...pending, version: 3 })
    expect(applyOrderUpdated(qc, orderUpdatedEvent('usr_001', withState(3, 'confirmed')), 'usr_001').applied).toBe(false)
  })
})

describe('reconcileAfterReconnect', () => {
  it('invalidates catalog, cart and pending orders; terminal orders and other private data stay', () => {
    const qc = client()
    qc.setQueryData(queryKeys.catalog.detail('nft_001'), ape)
    qc.setQueryData(queryKeys.cart.owner('user:usr_001'), { version: 1 })
    qc.setQueryData(queryKeys.user.order('usr_001', 'ord_1'), pending)
    qc.setQueryData(queryKeys.user.order('usr_001', 'ord_2'), withState(2, 'confirmed'))
    qc.setQueryData(queryKeys.user.profile('usr_001'), { displayName: 'x' })
    reconcileAfterReconnect(qc, 'usr_001')
    expect(qc.getQueryState(queryKeys.catalog.detail('nft_001'))?.isInvalidated).toBe(true)
    expect(qc.getQueryState(queryKeys.cart.owner('user:usr_001'))?.isInvalidated).toBe(true)
    expect(qc.getQueryState(queryKeys.user.order('usr_001', 'ord_1'))?.isInvalidated).toBe(true)
    expect(qc.getQueryState(queryKeys.user.order('usr_001', 'ord_2'))?.isInvalidated).toBe(false)
    expect(qc.getQueryState(queryKeys.user.profile('usr_001'))?.isInvalidated).toBe(false)
  })
})

describe('createEventDeduper', () => {
  it('flags repeated event ids and evicts the oldest beyond the limit', () => {
    const dedupe = createEventDeduper(2)
    expect(dedupe.seen('a')).toBe(false)
    expect(dedupe.seen('a')).toBe(true)
    expect(dedupe.seen('b')).toBe(false)
    expect(dedupe.seen('c')).toBe(false)
    expect(dedupe.seen('a')).toBe(false) // evicted
  })
})
