import { createFileRoute } from '@tanstack/react-router'
import { validateCatalogSearch } from '@/features/catalog/catalog-search'
import { CatalogSection } from '@/features/catalog/components/catalog-section'
import { FeaturedNftCard } from '@/features/home/components/featured-nft-card'
import { HeroCarousel } from '@/features/home/components/hero-carousel'
import { MintJournal } from '@/features/home/components/mint-journal'
import { PromoBanners } from '@/features/home/components/promo-banners'
import { CATALOG_ANCHOR_ID } from '@/features/home/content'

/**
 * Home ("Início"): hero carousel (featured API), catalog with the
 * "NFT em destaque" card under the filters, promo banners and the
 * "Diário da Cunhagem" editorial block. The catalog state lives in the URL:
 * `validateSearch` normalizes it with the contract `catalogQuerySchema`
 * (invalid fields fall back to defaults, defaults are omitted).
 */
export const Route = createFileRoute('/')({
  validateSearch: validateCatalogSearch,
  component: HomePage,
})

function HomePage() {
  return (
    <div className="flex flex-col gap-8 md:gap-20">
      <HeroCarousel />
      {/* EXPLORAR / promo links scroll here and move focus (tabIndex -1). */}
      <div id={CATALOG_ANCHOR_ID} tabIndex={-1} className="scroll-mt-4 rounded-sm outline-none">
        <CatalogSection asideFooter={<FeaturedNftCard className="hidden lg:block" />} />
      </div>
      <PromoBanners />
      <MintJournal />
    </div>
  )
}
