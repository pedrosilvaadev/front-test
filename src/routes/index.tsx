import { createFileRoute } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/')({
  component: HomePage,
})

/** Shell placeholder; the catalog (hero, filters, grid) ships in P2-02. */
function HomePage() {
  return (
    <section aria-labelledby="home-title" className="flex flex-col items-start gap-4">
      <p className="text-sm tracking-[0.08em] text-foreground">Bem-vindo à Kurio</p>
      <h1 id="home-title" className="text-3xl font-bold tracking-[0.06em] uppercase md:text-[2.5rem]">
        NFT Marketplace
      </h1>
      <p className="text-muted-foreground">
        The catalog is pending and will be available in an upcoming release.
      </p>
      <Button type="button" disabled className="rounded-sm font-bold tracking-[0.04em]">
        Browse catalog
      </Button>
    </section>
  )
}
