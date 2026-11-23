import { createFileRoute } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  return (
    <section aria-labelledby="home-title" className="flex flex-col items-start gap-4">
      <h1 id="home-title" className="text-3xl font-bold tracking-tight">
        NFT Marketplace
      </h1>
      <p className="text-muted-foreground">
        The catalog is pending and will be available in an upcoming release.
      </p>
      <Button type="button" disabled>
        Browse catalog
      </Button>
    </section>
  )
}
