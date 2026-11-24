import { useQuery } from '@tanstack/react-query'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { featuredNftsQueryOptions } from '../home-queries'

/**
 * "NFT EM DESTAQUE / OFERTA LIMITADA" card under the catalog filters
 * (Figma "Início", desktop only). Shows the second featured NFT so it differs
 * from the first hero slide (Figma: Sage Nomad), falling back to the first.
 * Shares the featured query with the hero (one request). On error or an
 * empty list it renders nothing: it is a promotional extra, never a blocker.
 */
export function FeaturedNftCard({ className }: { className?: string }) {
  const featured = useQuery(featuredNftsQueryOptions())
  const items = featured.data?.items ?? []
  const nft = items[1] ?? items[0]

  if (!featured.isPending && !nft) return null

  return (
    <section
      aria-labelledby="featured-nft-title"
      aria-busy={featured.isPending}
      data-testid="featured-nft"
      className={cn('overflow-hidden rounded-card bg-card', className)}
    >
      <div className="px-5 pt-5 pb-3 text-center">
        <h3 id="featured-nft-title" className="text-left text-xl font-bold tracking-[0.06em] text-brand uppercase">
          NFT em destaque
        </h3>
        <p className="mt-1.5 text-[0.9375rem] font-bold tracking-[0.06em] text-foreground uppercase">Oferta limitada</p>
      </div>
      {nft ? (
        <a
          href={`/nft/${encodeURIComponent(nft.slug)}`}
          className="group block overflow-hidden rounded-card outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        >
          <img
            src={nft.image.url}
            alt={nft.image.alt}
            width={nft.image.width}
            height={nft.image.height}
            loading="lazy"
            decoding="async"
            className="aspect-[310/365] w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        </a>
      ) : (
        <Skeleton className="aspect-[310/365] w-full rounded-card bg-accent" data-testid="featured-nft-skeleton" />
      )}
    </section>
  )
}
