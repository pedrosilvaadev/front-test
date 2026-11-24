import { createFileRoute } from '@tanstack/react-router'
import { validateCatalogSearch } from '@/features/catalog/catalog-search'
import { CatalogSection } from '@/features/catalog/components/catalog-section'

/**
 * Home ("Início"). The catalog state lives in the URL: `validateSearch`
 * normalizes it with the contract `catalogQuerySchema` (invalid fields fall
 * back to defaults, defaults are omitted). Hero/featured/editorial blocks ship
 * in P2-03.
 */
export const Route = createFileRoute('/')({
  validateSearch: validateCatalogSearch,
  component: HomePage,
})

function HomePage() {
  return (
    <div className="flex flex-col gap-8">
      {/* Visible page title arrives with the hero (P2-03). */}
      <h1 className="sr-only">NFT Marketplace</h1>
      <CatalogSection />
    </div>
  )
}
