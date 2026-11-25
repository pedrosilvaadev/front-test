import { Heart } from 'lucide-react'
import type { ReactNode } from 'react'
import type { NftSummary } from '@/contracts'
import { cn } from '@/lib/utils'
import { useFavoriteToggle } from '../favorites-queries'

interface FavoriteButtonProps {
  nft: NftSummary
  className?: string
  iconClassName?: string
  /** Visible text next to the icon (detail "Favoritar"); icon-only otherwise. */
  children?: ReactNode
  /** Show the rollback error visibly (detail) or only to assistive tech (cards). */
  visibleError?: boolean
  testId?: string
}

/**
 * Heart toggle (P3-02). `aria-pressed` reflects the favorite state; the
 * accessible name names the NFT. Optimistic with rollback; failures are
 * announced with an alert (rendered only on error, so lists stay quiet).
 */
export function FavoriteButton({ nft, className, iconClassName, children, visibleError = false, testId }: FavoriteButtonProps) {
  const { favorited, pending, error, toggle } = useFavoriteToggle(nft)
  const pressed = favorited === true
  // Constant name; the state is conveyed by `aria-pressed`.
  const label = `Favoritar ${nft.name}`
  return (
    <>
      <button
        type="button"
        aria-pressed={pressed}
        aria-label={children ? undefined : label}
        title={label}
        aria-busy={pending || undefined}
        data-testid={testId}
        data-state={favorited === null ? 'unknown' : pressed ? 'on' : 'off'}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          toggle()
        }}
        className={className}
      >
        <Heart className={cn('size-5', pressed && 'fill-current', iconClassName)} aria-hidden="true" />
        {children ? (
          <>
            {children}
            <span className="sr-only"> {nft.name}</span>
          </>
        ) : null}
      </button>
      {error ? (
        <span role="alert" className={visibleError ? 'text-xs text-destructive' : 'sr-only'}>
          {error}
        </span>
      ) : null}
    </>
  )
}
