import { http, HttpResponse, type DefaultBodyType } from 'msw'
import type { ErrorEnvelope } from '@/api/errors'
import { toFieldErrorsDetails, type NftDetail } from '@/contracts'
import { nftDevPatchSchema, patchNft } from '../catalog'
import { resetDb } from '../db'
import { apiPath, errorResponse } from '../http'
import { getScenario, isScenarioPresetName, resetScenario, setScenario } from '../scenario'

const devPath = (path: string) => apiPath(`/__dev${path}`)

/** Control endpoints for tests/E2E. Never affected by the active scenario. */
export const devHandlers = [
  http.post(devPath('/reset'), () => {
    resetDb()
    resetScenario()
    return new HttpResponse(null, { status: 204 })
  }),

  http.get(devPath('/scenario'), () => HttpResponse.json(getScenario())),

  http.put(devPath('/scenario'), async ({ request }) => {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return errorResponse(400, 'INVALID_JSON', 'Request body must be JSON.')
    }
    const name = typeof body === 'object' && body !== null && 'name' in body ? body.name : undefined
    if (!isScenarioPresetName(name)) {
      return errorResponse(422, 'UNKNOWN_SCENARIO', 'Unknown scenario preset.', { name })
    }
    const seed =
      typeof body === 'object' && body !== null && 'seed' in body && Number.isInteger(body.seed)
        ? (body.seed as number)
        : undefined
    return HttpResponse.json(setScenario(name, seed))
  }),

  /**
   * Domain control: patch price and/or edition availability of an NFT (id or
   * slug). Body `{ price?, previousPrice?, editions?: [{ id, available }] }`.
   * Bumps `version` and recomputes `totalAvailable`; 200 with the new detail.
   * Used by later realtime/quote scenarios (price change, sold out).
   */
  http.post<{ id: string }, DefaultBodyType, NftDetail | ErrorEnvelope>(devPath('/nfts/:id'), async ({ request, params }) => {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return errorResponse(400, 'INVALID_JSON', 'Request body must be JSON.')
    }
    const parsed = nftDevPatchSchema.safeParse(body)
    if (!parsed.success) {
      return errorResponse(422, 'VALIDATION_ERROR', 'Invalid NFT patch.', toFieldErrorsDetails(parsed.error))
    }
    const id = params.id
    const result = patchNft(id, parsed.data)
    if (result.ok) return HttpResponse.json<NftDetail>(result.nft)
    switch (result.code) {
      case 'NFT_NOT_FOUND':
        return errorResponse(404, 'NFT_NOT_FOUND', 'NFT not found.', { idOrSlug: id })
      case 'EDITION_NOT_FOUND':
        return errorResponse(404, 'EDITION_NOT_FOUND', 'Edition not found.', { editionId: result.editionId })
      case 'VALIDATION_ERROR':
        return errorResponse(422, 'VALIDATION_ERROR', 'Patch violates NFT invariants.', toFieldErrorsDetails(result.error))
    }
  }),
]
