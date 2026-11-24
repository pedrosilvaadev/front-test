import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { isPlainClick } from '@/lib/is-plain-click'
import { cn } from '@/lib/utils'
import { PROMO_BANNERS } from '../content'
import { scrollToCatalog } from '../scroll-to-catalog'

/**
 * Two promo banners (Figma "Início", below the catalog): image left, copy and
 * an "Explorar" link right. Each link writes a fixed catalog URL state
 * (`/?tab=new`, `/?categories=digital-art`) and brings the catalog into view.
 * Stacked below `lg`, two columns from 1024px.
 */
export function PromoBanners() {
  return (
    <section aria-labelledby="promo-title" data-testid="promo-banners">
      <h2 id="promo-title" className="sr-only">
        Coleções em destaque
      </h2>
      <ul className="grid gap-4 lg:grid-cols-2 lg:gap-6">
        {PROMO_BANNERS.map((banner) => (
          <li key={banner.id} className="flex min-w-0 overflow-hidden rounded-2xl bg-card">
            <img
              src={banner.image}
              alt=""
              width={288}
              height={252}
              loading="lazy"
              decoding="async"
              className="w-[40%] shrink-0 object-cover sm:w-[11rem] lg:w-[46%] xl:w-[18rem]"
            />
            <div className="flex min-w-0 flex-1 flex-col items-end justify-center gap-2 px-4 py-5 text-right sm:px-6">
              <h3 className="text-sm leading-snug font-bold tracking-[0.04em] text-foreground md:text-base">
                {banner.title}
              </h3>
              <p className="text-xs leading-relaxed text-muted-foreground md:text-[0.8125rem]">{banner.description}</p>
              <Link
                to="/"
                search={banner.search}
                resetScroll={false}
                onClick={(event) => {
                  // Same-tab plain clicks follow the filter change to the results (catalog is above);
                  // modified/middle clicks keep the browser behaviour (new tab/window).
                  if (isPlainClick(event)) scrollToCatalog()
                }}
                className={cn(
                  'mt-1 inline-flex h-9 items-center gap-1.5 rounded-sm bg-primary px-4 text-[0.8125rem] font-bold tracking-[0.04em] text-primary-foreground outline-none',
                  'hover:bg-brand focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card',
                )}
              >
                Explorar
                <span className="sr-only"> {banner.title}</span>
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
