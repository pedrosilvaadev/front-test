import { http, HttpResponse, type DefaultBodyType } from 'msw'
import type { ErrorEnvelope } from '@/api/errors'
import {
  toFieldErrorsDetails,
  walletConnectRequestSchema,
  walletInputSchema,
  walletSlotSchema,
  type Wallet,
  type WalletConnection,
  type WalletsResponse,
} from '@/contracts'
import { apiPath, errorResponse } from '../http'
import { authenticate } from '../sessions'
import { connectWallet, listWallets, putWallet, setConnection } from '../wallet-store'
import { invalidJson, readJsonBody } from './cart'

/** 401 for a missing/invalid/expired bearer token (shared by user-only endpoints). */
export async function requireUser(
  request: Request,
): Promise<{ ok: true; userId: string } | { ok: false; response: ReturnType<typeof errorResponse> }> {
  const auth = await authenticate(request)
  if (auth.ok) return { ok: true, userId: auth.record.user.id }
  return {
    ok: false,
    response:
      auth.code === 'SESSION_EXPIRED'
        ? errorResponse(401, 'SESSION_EXPIRED', 'Session expired. Sign in again.')
        : errorResponse(401, 'UNAUTHORIZED', 'Authentication required.'),
  }
}

type SlotParams = { slot: string }

function parseSlot(raw: string) {
  const parsed = walletSlotSchema.safeParse(raw)
  return parsed.success ? parsed.data : undefined
}

const notFound = () => errorResponse(404, 'WALLET_NOT_FOUND', 'Wallet not found.')

/** Wallet endpoints used by checkout (docs/API_CONTRACTS.md "Wallets"). */
export const walletHandlers = [
  http.get<never, DefaultBodyType, WalletsResponse | ErrorEnvelope>(apiPath('/wallets'), async ({ request }) => {
    const user = await requireUser(request)
    if (!user.ok) return user.response
    return HttpResponse.json<WalletsResponse>(listWallets(user.userId))
  }),

  http.put<SlotParams, DefaultBodyType, Wallet | ErrorEnvelope>(apiPath('/wallets/:slot'), async ({ request, params }) => {
    const user = await requireUser(request)
    if (!user.ok) return user.response
    const slot = parseSlot(params.slot)
    if (!slot) return notFound()
    const json = await readJsonBody(request)
    if (!json.ok) return invalidJson()
    const parsed = walletInputSchema.safeParse(json.body)
    if (!parsed.success) {
      return errorResponse(422, 'VALIDATION_ERROR', 'Invalid wallet.', toFieldErrorsDetails(parsed.error))
    }
    const result = putWallet(user.userId, slot, parsed.data)
    if (!result.ok) return errorResponse(409, 'PRIMARY_WALLET_REQUIRED', 'Create the primary wallet first.')
    return HttpResponse.json<Wallet>(result.wallet, { status: result.created ? 201 : 200 })
  }),

  http.post<SlotParams, DefaultBodyType, WalletConnection | ErrorEnvelope>(
    apiPath('/wallets/:slot/connection'),
    async ({ request, params }) => {
      const user = await requireUser(request)
      if (!user.ok) return user.response
      const slot = parseSlot(params.slot)
      if (!slot) return notFound()
      const json = await readJsonBody(request)
      if (!json.ok) return invalidJson()
      const parsed = walletConnectRequestSchema.safeParse(json.body)
      if (!parsed.success) {
        return errorResponse(422, 'VALIDATION_ERROR', 'Invalid connection request.', toFieldErrorsDetails(parsed.error))
      }
      const result = connectWallet(user.userId, slot, parsed.data.network)
      if (result.ok) return HttpResponse.json<WalletConnection>(result.connection)
      switch (result.code) {
        case 'WALLET_NOT_FOUND':
          return notFound()
        case 'WALLET_NETWORK_MISMATCH':
          return errorResponse(409, 'WALLET_NETWORK_MISMATCH', 'The wallet belongs to another network.')
        case 'WALLET_CONNECTION_REJECTED':
          return errorResponse(409, 'WALLET_CONNECTION_REJECTED', 'The connection was rejected in the wallet.')
      }
    },
  ),

  // Idempotent.
  http.delete<SlotParams>(apiPath('/wallets/:slot/connection'), async ({ request, params }) => {
    const user = await requireUser(request)
    if (!user.ok) return user.response
    const slot = parseSlot(params.slot)
    if (slot) setConnection(user.userId, slot, null)
    return new HttpResponse(null, { status: 204 })
  }),
]
