import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import type { Edition, NftDetail } from '@/contracts'
import { cartErrorMessage } from './cart-errors'
import { useAddToCart } from './cart-queries'

/** Edition + quantity chosen by the user (see nft-detail `usePurchaseSelection`). */
interface SelectionLike {
  edition: Edition | undefined
  quantity: number
  soldOut: boolean
}

export type PurchaseFeedbackState = { tone: 'success'; message: string } | { tone: 'error'; message: string }

export interface PurchaseActions {
  pending: boolean
  disabled: boolean
  feedback: PurchaseFeedbackState | null
  /** Adds the selected edition × quantity; `goToCart` opens `/carrinho` on success (COMPRAR). */
  addSelected: (options?: { goToCart?: boolean }) => void
}

/**
 * Add-to-cart for the detail page (P4-01). The selection is already bounded
 * by the edition (1 … min(available, maxPerOrder)); the server re-checks the
 * sum with what is already in the cart and answers 409
 * `AVAILABILITY_CONFLICT` with the allowed max, shown inline. Ignored while a
 * request is in flight (double click safe).
 */
export function usePurchaseActions(nft: NftDetail, selection: SelectionLike): PurchaseActions {
  const add = useAddToCart()
  const navigate = useNavigate()
  const [feedback, setFeedback] = useState<PurchaseFeedbackState | null>(null)
  const disabled = selection.soldOut || !selection.edition

  function addSelected({ goToCart = false } = {}) {
    if (add.isPending || disabled || !selection.edition) return
    setFeedback(null)
    const quantity = selection.quantity
    add.mutate(
      { nftId: nft.id, editionId: selection.edition.id, quantity },
      {
        onSuccess: () => {
          if (goToCart) {
            void navigate({ to: '/carrinho' })
            return
          }
          setFeedback({
            tone: 'success',
            message: quantity === 1 ? 'Adicionado ao carrinho.' : `${String(quantity)} unidades adicionadas ao carrinho.`,
          })
        },
        onError: (error) => setFeedback({ tone: 'error', message: cartErrorMessage(error) }),
      },
    )
  }

  return { pending: add.isPending, disabled, feedback, addSelected }
}

