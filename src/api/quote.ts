import { quoteSchema, type Quote, type QuoteRequest } from '@/contracts'
import { ownerConfig, type CartRequestOwner } from './cart'
import { apiClient } from './client'
import type { RequestOptions } from './nfts'

/**
 * `POST /api/quotes` → 201 `Quote` for the owner's current cart
 * (docs/API_CONTRACTS.md "Quote"). Side-effect free, so it is used as a query.
 * 404 `QUOTE_NOT_FOUND` when `previousQuoteId` is unknown.
 */
export async function createQuote(owner: CartRequestOwner, body: QuoteRequest, options?: RequestOptions): Promise<Quote> {
  const { data } = await apiClient.post<unknown>('/quotes', body, ownerConfig(owner, options))
  return quoteSchema.parse(data)
}
