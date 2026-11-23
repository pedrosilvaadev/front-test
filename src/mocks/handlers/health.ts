import { http, HttpResponse } from 'msw'
import type { HealthResponse } from '@/api/health'
import { apiPath } from '../http'

export const healthHandlers = [
  http.get(apiPath('/health'), () => HttpResponse.json<HealthResponse>({ status: 'ok' })),
]
