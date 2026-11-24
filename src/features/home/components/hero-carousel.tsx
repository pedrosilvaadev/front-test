import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { isPlainClick } from '@/lib/is-plain-click'
import { cn } from '@/lib/utils'
import { CATALOG_ANCHOR_ID, HERO_COPY } from '../content'
import { featuredNftsQueryOptions, HERO_SLIDE_LIMIT } from '../home-queries'
import { scrollToCatalog } from '../scroll-to-catalog'

/** Art box: Figma mobile ≈138px, desktop ≈450px square; reserved while loading (no CLS). */
const ART_BOX = 'size-[8.5rem] rounded-[0.75rem] md:size-72 md:rounded-[1.25rem] lg:size-[28.125rem]'

type HeroState = 'loading' | 'ready' | 'empty' | 'error'

/**
 * Home hero (Figma "Início"). The headline, description and EXPLORAR are
 * static marketing copy; the artwork is one slide per featured NFT from
 * `GET /api/nfts/featured` (max 3). No autoplay: slides change only through
 * the dots or Left/Right while focus is inside the hero (APG carousel with
 * `aria-live="polite"`). Loading reserves the art box with a shimmer;
 * an error or an empty list degrades to the copy alone.
 *
 * Mobile (< md): single rounded gradient card, art at the right with the next
 * slide's art overlapping it, text link CTA and centred dots.
 * Desktop: text column on the left, large rounded art on the right.
 */
export function HeroCarousel() {
  const featured = useQuery(featuredNftsQueryOptions())
  const slides = featured.data?.items.slice(0, HERO_SLIDE_LIMIT) ?? []
  const [selected, setSelected] = useState(0)
  const dotRefs = useRef<Array<HTMLButtonElement | null>>([])

  const total = slides.length
  const active = total > 0 ? Math.min(selected, total - 1) : 0
  let state: HeroState
  if (featured.isPending) state = 'loading'
  else if (featured.isError && total === 0) state = 'error'
  else state = total > 0 ? 'ready' : 'empty'
  const isCarousel = state === 'ready'

  function goTo(index: number, focusDot = false) {
    const next = (index + total) % total
    setSelected(next)
    if (focusDot) dotRefs.current[next]?.focus()
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (!isCarousel || total < 2) return
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    const target = event.target as HTMLElement
    // Only from the dots or the slide itself: arrows on EXPLORAR or other links keep their default.
    if (!target.closest('[data-carousel-dot], [aria-roledescription="slide"]')) return
    event.preventDefault()
    const fromDot = target.dataset.carouselDot !== undefined
    goTo(active + (event.key === 'ArrowRight' ? 1 : -1), fromDot)
  }

  function onExplore(event: MouseEvent<HTMLAnchorElement>) {
    if (!isPlainClick(event)) return
    if (scrollToCatalog()) event.preventDefault()
  }

  const secondary = total > 1 ? slides[(active + 1) % total] : undefined

  return (
    <section
      aria-label="Destaques"
      aria-roledescription={isCarousel ? 'carousel' : undefined}
      aria-busy={state === 'loading'}
      data-state={state}
      data-testid="home-hero"
      onKeyDown={onKeyDown}
      className={cn(
        'relative isolate grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 overflow-hidden',
        'rounded-[1.5rem] bg-linear-to-br from-secondary to-card px-4 pt-4 pb-7',
        'md:min-h-72 md:grid-rows-[1fr_auto] md:gap-x-8 lg:min-h-[28.125rem] md:overflow-visible md:rounded-none md:bg-none md:p-0 lg:gap-x-12',
      )}
    >
      {/* Decorative glow of the mobile card. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-16 left-1/3 -z-10 size-72 rounded-full bg-foreground/[0.04] md:hidden"
      />

      <div className="flex min-w-0 flex-col items-start md:py-6 lg:pl-6">
        <p className="text-[0.8125rem] font-bold tracking-[0.04em] text-foreground md:text-sm md:font-normal">
          {HERO_COPY.eyebrow}
        </p>
        <h1 className="mt-2 text-base leading-snug md:max-w-[32rem] font-bold tracking-[0.04em] text-foreground md:mt-5 md:text-[2rem] md:leading-[1.5] lg:text-[2.5rem] lg:leading-[1.75]">
          <span className="md:hidden">{HERO_COPY.titleMobile}</span>
          <span className="hidden md:inline">{HERO_COPY.titleDesktop}</span>
        </h1>
        <p className="mt-2 max-w-md text-xs leading-normal tracking-[0.02em] text-muted-foreground md:mt-4 md:text-sm md:leading-[1.75]">
          <span className="md:hidden">{HERO_COPY.descriptionMobile}</span>
          <span className="hidden md:inline">{HERO_COPY.descriptionDesktop}</span>
        </p>
        <a
          href={`#${CATALOG_ANCHOR_ID}`}
          onClick={onExplore}
          className={cn(
            'mt-2 inline-flex items-center gap-2 rounded-sm text-sm font-bold tracking-[0.04em] text-brand outline-none',
            'hover:underline focus-visible:ring-2 focus-visible:ring-ring',
            'md:mt-8 md:h-10 md:bg-primary md:px-6 md:text-primary-foreground md:hover:bg-brand md:hover:no-underline',
          )}
        >
          {HERO_COPY.cta}
          <ArrowRight className="size-4 md:hidden" aria-hidden="true" />
        </a>
      </div>

      {state === 'loading' ? (
        <div className="md:row-span-2" data-testid="hero-skeleton">
          <Skeleton className={cn(ART_BOX, 'bg-card')} />
        </div>
      ) : null}

      {state === 'error' || state === 'empty' ? (
        // Mobile: keep the art column width so the copy wraps exactly as while loading (no CLS).
        <div aria-hidden="true" className="w-[8.5rem] md:hidden" data-testid="hero-art-spacer" />
      ) : null}

      {isCarousel ? (
        <>
          <div className="relative md:row-span-2">
            <div aria-live="polite" className="relative">
              {slides.map((nft, index) => (
                <div
                  key={nft.id}
                  role="group"
                  aria-roledescription="slide"
                  aria-label={`${String(index + 1)} de ${String(total)}: ${nft.name}`}
                  hidden={index !== active}
                  className="animate-in duration-500 fade-in"
                >
                  <Link
                    to="/nft/$idOrSlug"
                    params={{ idOrSlug: nft.slug }}
                    className={cn(
                      'block overflow-hidden bg-card outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                      ART_BOX,
                    )}
                  >
                    <img
                      src={nft.image.url}
                      alt={nft.image.alt}
                      width={nft.image.width}
                      height={nft.image.height}
                      loading={index === 0 ? 'eager' : 'lazy'}
                      fetchPriority={index === 0 ? 'high' : 'auto'}
                      decoding="async"
                      className="size-full object-cover"
                    />
                  </Link>
                </div>
              ))}
            </div>
            {secondary ? (
              <img
                src={secondary.image.url}
                alt=""
                aria-hidden="true"
                width={secondary.image.width}
                height={secondary.image.height}
                loading="lazy"
                decoding="async"
                data-testid="hero-secondary-art"
                className="pointer-events-none absolute -bottom-2 -left-3 size-14 rounded-[0.625rem] border-2 border-card object-cover shadow-lg md:hidden"
              />
            ) : null}
          </div>

          {total > 1 ? (
            <div
              role="group"
              aria-label="Escolher slide"
              className="absolute inset-x-0 bottom-1 flex justify-center gap-1 md:static md:col-start-1 md:row-start-2 md:justify-end md:self-end md:pb-2"
            >
              {slides.map((nft, index) => (
                <button
                  key={nft.id}
                  ref={(node) => {
                    dotRefs.current[index] = node
                  }}
                  type="button"
                  data-carousel-dot=""
                  aria-label={`Slide ${String(index + 1)} de ${String(total)}`}
                  aria-current={index === active ? 'true' : undefined}
                  onClick={() => goTo(index)}
                  className="group flex size-6 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span
                    className={cn(
                      'size-2 rounded-full transition-colors',
                      index === active ? 'bg-brand' : 'bg-primary/45 group-hover:bg-primary/80',
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
