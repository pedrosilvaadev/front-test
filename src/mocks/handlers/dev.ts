import { http, HttpResponse } from 'msw'
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
]
