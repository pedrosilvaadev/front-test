import { http, HttpResponse, type DefaultBodyType, type PathParams } from 'msw'
import type { ErrorEnvelope } from '@/api/errors'
import { quoteRequestSchema, toFieldErrorsDetails, type Quote } from '@/contracts'
import { createQuote, resolveOwner } from '../cart-store'
import { apiPath, errorResponse } from '../http'
import { invalidJson, ownerError, readJsonBody } from './cart'

/** `POST /api/quotes` (docs/API_CONTRACTS.md "Quote"): prices the caller's current cart. */
export const quoteHandlers = [
  http.post<PathParams, DefaultBodyType, Quote | ErrorEnvelope>(apiPath('/quotes'), async ({ request }) => {
    const owner = await resolveOwner(request)
    if (!owner.ok) return ownerError(owner)
    const json = await readJsonBody(request)
    if (!json.ok) return invalidJson()
    const parsed = quoteRequestSchema.safeParse(json.body)
    if (!parsed.success) {
      return errorResponse(422, 'VALIDATION_ERROR', 'Invalid quote request.', toFieldErrorsDetails(parsed.error))
    }
    const result = createQuote(owner.owner, parsed.data.network, parsed.data.previousQuoteId)
    if (!result.ok) return errorResponse(404, 'QUOTE_NOT_FOUND', 'Previous quote not found.')
    return HttpResponse.json<Quote>(result.quote, { status: 201 })
  }),
]
