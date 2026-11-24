import { Link } from '@tanstack/react-router'
import type { NftSummary } from '@/contracts'
import { formatEth } from '@/lib/money'
import { cn } from '@/lib/utils'
import { RARITY_LABELS } from '../labels'

interface NftCardProps {
  nft: NftSummary
  /** Above-the-fold cards load eagerly (LCP); the rest lazily. */
  eager?: boolean
}

/**
 * Catalog card (Figma "Início"): framed art, the name (it already carries
 * the number, e.g. "Emerald Ape #042"), price in ETH and the strike-through
 * previous price when discounted. The whole card is
 * clickable through a stretched link on the name, so the accessible link name
 * stays short. Router `<Link>` to `/nft/$idOrSlug`: client navigation (with
 * intent preloading); modifier/middle clicks keep the native new-tab behaviour.
 */
export function NftCard({ nft, eager = false }: NftCardProps) {
  const showRarity = nft.rarity !== 'common'
  return (
    <article className="group relative flex flex-col" data-testid="nft-card">
      <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-2xl bg-card p-1 md:aspect-[258/300] md:rounded-sm md:p-1">
        <img
          src={nft.image.url}
          alt={nft.image.alt}
          width={nft.image.width}
          height={nft.image.height}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          className="aspect-square w-full rounded-xl object-cover transition-transform duration-300 group-hover:scale-[1.02] md:rounded-card"
        />
        {showRarity ? (
          <span className="absolute top-4 left-1 rounded-r-sm bg-primary px-2 py-1 text-xs font-bold tracking-[0.04em] text-primary-foreground uppercase md:hidden">
            {RARITY_LABELS[nft.rarity]}
          </span>
        ) : null}
      </div>
      <h3 className="mt-3 truncate text-[0.9375rem] tracking-[0.02em] text-foreground md:mt-4">
        <Link
          to="/nft/$idOrSlug"
          params={{ idOrSlug: nft.slug }}
          className={cn(
            'rounded-sm outline-none after:absolute after:inset-0 after:rounded-2xl after:content-[""]',
            'focus-visible:after:ring-2 focus-visible:after:ring-ring hover:text-brand',
          )}
        >
          {nft.name}
        </Link>
      </h3>
      <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-[0.9375rem] font-bold tracking-[0.04em] text-brand md:text-base">
        <span>
          <span className="sr-only">Preço: </span>
          {formatEth(nft.price)}
        </span>
        {nft.previousPrice ? (
          <s className="font-normal text-subtle-foreground">
            <span className="sr-only">Preço anterior: </span>
            {formatEth(nft.previousPrice)}
          </s>
        ) : null}
      </p>
    </article>
  )
}
