import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, vi } from 'vitest'
import { resetDb } from '@/mocks/db'
import { server } from '@/mocks/node'
import { resetScenario } from '@/mocks/scenario'

// jsdom does not implement scrolling; router scroll restoration calls it.
Object.defineProperty(window, 'scrollTo', { value: vi.fn(), writable: true })

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' })
})

afterEach(() => {
  cleanup()
  server.resetHandlers()
  resetScenario()
  resetDb()
})

afterAll(() => {
  server.close()
})
