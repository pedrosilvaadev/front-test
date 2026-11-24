import { isApiError } from '@/api/errors'
import { availabilityConflictDetailsSchema, type AvailabilityConflictDetails, type Quote, type QuoteChange } from '@/contracts'
import { formatEth } from '@/lib/money'

/** `details` of a cart 409 `AVAILABILITY_CONFLICT`, or `undefined` for any other error. */
export function availabilityConflict(error: unknown): AvailabilityConflictDetails | undefined {
  if (!isApiError(error) || error.code !== 'AVAILABILITY_CONFLICT') return undefined
  const parsed = availabilityConflictDetailsSchema.safeParse(error.details)
  return parsed.success ? parsed.data : undefined
}

function units(count: number): string {
  return count === 1 ? '1 unidade' : `${String(count)} unidades`
}

/** Inline copy for an availability conflict (shows the allowed max). */
export function conflictMessage(details: AvailabilityConflictDetails): string {
  if (details.maxQuantity === 0) return 'Esta edição esgotou e não pode ser adicionada.'
  return `Quantidade indisponível: o máximo permitido para esta edição é ${units(details.maxQuantity)}.`
}

/** Portuguese copy for a failed cart mutation. */
export function cartErrorMessage(error: unknown): string {
  const conflict = availabilityConflict(error)
  if (conflict) return conflictMessage(conflict)
  if (!isApiError(error)) return 'Não foi possível atualizar o carrinho. Tente novamente.'
  switch (error.code) {
    case 'COUPON_INVALID':
      return 'Cupom inválido. Confira o código e tente novamente.'
    case 'COUPON_EXPIRED':
      return 'Este cupom expirou.'
    case 'VALIDATION_ERROR':
      return 'Dados inválidos. Confira e tente novamente.'
    case 'NFT_NOT_FOUND':
    case 'EDITION_NOT_FOUND':
      return 'Este NFT não está mais disponível.'
    case 'CART_ITEM_NOT_FOUND':
      return 'Este item não está mais no carrinho.'
    case 'SESSION_EXPIRED':
    case 'UNAUTHORIZED':
      return 'Sua sessão expirou. Entre novamente.'
    case 'NETWORK_ERROR':
      return 'Sem conexão. Verifique sua internet e tente novamente.'
    case 'TIMEOUT':
      return 'O servidor demorou para responder. Tente novamente.'
    default:
      return 'Não foi possível atualizar o carrinho. Tente novamente.'
  }
}

/** Human readable description of a quote change (names from the quote lines). */
export function quoteChangeMessage(change: QuoteChange, quote: Pick<Quote, 'lines'>): string {
  const name =
    'editionId' in change
      ? (quote.lines.find((line) => line.editionId === change.editionId)?.name ?? 'Um item')
      : ''
  switch (change.type) {
    case 'price_changed':
      return `O preço de ${name} mudou de ${formatEth(change.previousUnitPrice)} para ${formatEth(change.unitPrice)}.`
    case 'availability_changed':
      return `${name}: apenas ${units(change.available)} disponível(is); você pediu ${String(change.requested)}.`
    case 'item_unavailable':
      return `${name} esgotou.`
    case 'coupon_invalidated':
      return change.reason === 'expired'
        ? `O cupom ${change.code} expirou e foi removido do cálculo.`
        : `O cupom ${change.code} não é mais válido e foi removido do cálculo.`
    case 'fee_changed':
      return `A taxa de rede mudou de ${formatEth(change.previousNetworkFee)} para ${formatEth(change.networkFee)}.`
  }
}
