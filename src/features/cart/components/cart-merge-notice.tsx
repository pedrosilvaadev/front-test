import { X } from 'lucide-react'
import { useSyncExternalStore } from 'react'
import type { CartMergeResult } from '@/contracts'
import { useCart } from '../cart-queries'
import { dismissCartMergeNotice, readCartMergeNotice, subscribeCartMergeNotice } from '../merge-notice'

const REASON: Record<CartMergeResult['adjustments'][number]['reason'], string> = {
  availability: 'limitado ao estoque disponível',
  max_per_order: 'limitado ao máximo por pedido',
  unavailable: 'esgotado, não foi adicionado',
}

/**
 * Result of merging the guest cart at sign-in (ADR-006): what was kept and
 * every quantity that was reduced or dropped. Polite live region; stays until
 * dismissed (or the session changes).
 */
export function CartMergeNotice() {
  const notice = useSyncExternalStore(subscribeCartMergeNotice, readCartMergeNotice, () => null)
  const { cart } = useCart()
  if (!notice) return null
  const nameOf = (editionId: string) => {
    const item = cart?.items.find((line) => line.editionId === editionId)
    return item ? `${item.nft.name} (${item.nft.editionLabel})` : 'Um item'
  }
  return (
    <div
      role="status"
      data-testid="cart-merge-notice"
      className="fixed inset-x-4 bottom-[calc(var(--tab-bar-height)+env(safe-area-inset-bottom)+1rem)] z-50 mx-auto max-w-md rounded-card border border-border-accent bg-card p-4 shadow-[0_8px_24px_rgb(0_0_0/0.45)] md:right-6 md:bottom-6 md:left-auto md:mx-0 md:w-[24rem]"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-bold tracking-[0.04em] text-foreground">Carrinho atualizado</p>
        <button
          type="button"
          onClick={dismissCartMergeNotice}
          aria-label="Fechar aviso do carrinho"
          className="-m-1 inline-flex size-7 items-center justify-center rounded-sm text-muted-foreground outline-none hover:text-brand focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
      <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted-foreground">
        {notice.adjustments.length > 0
          ? 'Os itens que você adicionou antes de entrar foram combinados com o seu carrinho, com ajustes:'
          : 'Os itens que você adicionou antes de entrar foram combinados com o seu carrinho.'}
      </p>
      {notice.adjustments.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-1 text-[0.8125rem] text-foreground" data-testid="cart-merge-adjustments">
          {notice.adjustments.map((adjustment) => (
            <li key={`${adjustment.nftId}:${adjustment.editionId}`}>
              {nameOf(adjustment.editionId)}: {adjustment.requested} → {adjustment.applied} ({REASON[adjustment.reason]})
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
