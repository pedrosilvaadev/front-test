import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { NftCard } from '../../catalog/components/nft-card'
import { relatedNftsQueryOptions } from '../detail-queries'

const itemClass = 'w-[11.5rem] shrink-0 snap-start md:w-[calc((100%-2*1.5rem)/3)] lg:w-[calc((100%-4*1.5rem)/5)]'

interface Pages {
  count: number
  active: number
}

/** Page count / active page of a horizontal scroller (one page = one visible width). */
function measurePages(el: HTMLElement): Pages {
  const { scrollWidth, clientWidth, scrollLeft } = el
  if (clientWidth <= 0) return { count: 1, active: 0 }
  const count = Math.max(1, Math.ceil(scrollWidth / clientWidth - 0.01))
  const atEnd = scrollLeft + clientWidth >= scrollWidth - 2
  const active = atEnd ? count - 1 : Math.min(count - 1, Math.round(scrollLeft / clientWidth))
  return { count, active }
}

/**
 * "Mais desta coleção": related NFTs from `GET /api/nfts/:idOrSlug/related`
 * in a horizontal scroll-snap row. Desktop adds page dots; mobile scrolls by
 * touch. Cards reuse the catalog `NftCard` (router links: client navigation
 * with scroll reset). Empty list → section hidden; error → inline retry.
 */
export function RelatedNfts({ idOrSlug }: { idOrSlug: string }) {
  const related = useQuery(relatedNftsQueryOptions(idOrSlug))
  const scroller = useRef<HTMLUListElement>(null)
  const [pages, setPages] = useState<Pages>({ count: 1, active: 0 })
  const items = related.data?.items ?? []
  const itemCount = items.length

  const update = useCallback(() => {
    const el = scroller.current
    if (!el) return
    const next = measurePages(el)
    setPages((prev) => (prev.count === next.count && prev.active === next.active ? prev : next))
  }, [])

  useEffect(() => {
    const el = scroller.current
    if (!el) return
    el.scrollLeft = 0
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [update, itemCount, idOrSlug])

  if (related.isSuccess && itemCount === 0) return null

  function goToPage(index: number) {
    const el = scroller.current
    if (!el) return
    el.scrollTo({ left: index * el.clientWidth, behavior: 'smooth' })
  }

  return (
    <section aria-labelledby="related-title" data-testid="related-nfts" className="flex flex-col gap-6 md:gap-7">
      <h2
        id="related-title"
        className="border-b border-border pb-2 text-base font-bold tracking-[0.04em] text-brand md:text-[0.9375rem]"
      >
        Mais desta coleção
      </h2>

      {related.isPending ? (
        <ul aria-hidden="true" className="flex gap-4 overflow-hidden md:gap-6" data-testid="related-skeleton">
          {Array.from({ length: 5 }, (_, index) => (
            <li key={index} className={itemClass}>
              <Skeleton className="aspect-square w-full rounded-2xl bg-card md:aspect-[258/300] md:rounded-sm" />
              <Skeleton className="mt-4 h-4 w-3/4 bg-card" />
              <Skeleton className="mt-2 h-4 w-1/3 bg-card" />
            </li>
          ))}
        </ul>
      ) : null}

      {related.isError && itemCount === 0 ? (
        <div role="alert" className="flex flex-col items-start gap-3 rounded-sm bg-card p-5">
          <p className="text-sm text-muted-foreground">Não foi possível carregar os NFTs relacionados.</p>
          <Button
            type="button"
            onClick={() => void related.refetch()}
            disabled={related.isFetching}
            className="rounded-sm font-bold"
          >
            {related.isFetching ? 'Tentando novamente…' : 'Tentar novamente'}
          </Button>
        </div>
      ) : null}

      {itemCount > 0 ? (
        <>
          <ul
            ref={scroller}
            aria-label="NFTs relacionados"
            onScroll={update}
            className="-mx-6 flex snap-x snap-mandatory scroll-px-6 gap-4 overflow-x-auto px-6 pb-2 [scrollbar-width:none] md:mx-0 md:scroll-px-0 md:gap-6 md:px-0 [&::-webkit-scrollbar]:hidden"
          >
            {items.map((nft) => (
              <li key={nft.id} className={itemClass}>
                <NftCard nft={nft} />
              </li>
            ))}
          </ul>
          {pages.count > 1 ? (
            <div role="group" aria-label="Páginas de NFTs relacionados" className="hidden justify-center gap-1 md:flex">
              {Array.from({ length: pages.count }, (_, index) => (
                <button
                  key={index}
                  type="button"
                  aria-label={`Página ${String(index + 1)} de ${String(pages.count)}`}
                  aria-current={index === pages.active ? 'true' : undefined}
                  onClick={() => goToPage(index)}
                  className="group flex size-6 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span
                    className={cn(
                      'size-2.5 rounded-full border border-primary transition-colors',
                      index === pages.active ? 'bg-primary' : 'group-hover:bg-primary/50',
                    )}
                  />
                </button>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  )
}
