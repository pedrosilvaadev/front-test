import { describe, expect, it } from 'vitest'
import { ApiError } from '@/api/errors'
import { getNft } from '@/api/nfts'
import { setScenario, SCENARIO_PRESETS } from '@/mocks/scenario'
import { queryKeys } from '@/lib/query-keys'
import { detailFailure, nftDetailQueryOptions, relatedNftsQueryOptions } from './detail-queries'
import { filledStars, reviewsLabel, shortenAddress } from './format'

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error('expected a rejection')
}

describe('detailFailure', () => {
  it('maps the API 404 NFT_NOT_FOUND to not-found', async () => {
    const error = await rejection(getNft('does-not-exist'))
    expect(error).toBeInstanceOf(ApiError)
    expect(detailFailure(error)).toBe('not-found')
  })

  it('maps server errors, other 404s and unknown errors to a retryable error state', async () => {
    setScenario(SCENARIO_PRESETS['server-error'])
    expect(detailFailure(await rejection(getNft('emerald-ape-042')))).toBe('error')
    expect(detailFailure(new ApiError({ kind: 'not_found', status: 404, code: 'NOT_FOUND' }))).toBe('error')
    expect(detailFailure(new ApiError({ kind: 'network' }))).toBe('error')
    expect(detailFailure(new Error('boom'))).toBe('error')
  })
})

describe('detail query options', () => {
  it('use the ADR-004 public catalog keys', () => {
    expect(nftDetailQueryOptions('emerald-ape-042').queryKey).toEqual(queryKeys.catalog.detail('emerald-ape-042'))
    expect(relatedNftsQueryOptions('nft_001').queryKey).toEqual(['catalog', 'related', 'nft_001'])
  })

  it('never retry a 404', () => {
    const retry = nftDetailQueryOptions('x').retry
    if (typeof retry !== 'function') throw new Error('retry must be a function')
    expect(retry(0, new ApiError({ kind: 'not_found', status: 404, code: 'NFT_NOT_FOUND' }))).toBe(false)
    expect(retry(0, new ApiError({ kind: 'transient', status: 500 }))).toBe(true)
  })
})

describe('format helpers', () => {
  it('shortens contract addresses', () => {
    expect(shortenAddress('0x7a4210aabbccddeeff00112233445566778819e8')).toBe('0x7a42...19e8')
    expect(shortenAddress('0x1234')).toBe('0x1234')
  })

  it('rounds the rating average to filled stars', () => {
    expect(filledStars('4.8')).toBe(5)
    expect(filledStars('4.4')).toBe(4)
    expect(filledStars('4.5')).toBe(5)
    expect(filledStars('0')).toBe(0)
  })

  it('pluralizes the reviews label', () => {
    expect(reviewsLabel(1)).toBe('1 avaliação de colecionador')
    expect(reviewsLabel(19)).toBe('19 avaliações de colecionadores')
  })
})
