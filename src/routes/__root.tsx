import { createRootRouteWithContext, Link, Outlet } from '@tanstack/react-router'
import { AppLayout } from '@/components/layout/app-layout'
import { Button } from '@/components/ui/button'
import type { RouterContext } from '@/router'

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  notFoundComponent: NotFound,
})

function RootLayout() {
  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  )
}

function NotFound() {
  return (
    <section
      aria-labelledby="not-found-title"
      className="flex flex-col items-start gap-4 rounded-card bg-card p-6 md:p-10"
    >
      <p className="text-sm font-bold tracking-[0.12em] text-brand">404</p>
      <h1 id="not-found-title" className="text-2xl font-bold tracking-[0.04em]">
        Page not found
      </h1>
      <p className="text-muted-foreground">The page you are looking for does not exist.</p>
      <Button asChild className="rounded-sm font-bold">
        <Link to="/">Back to home</Link>
      </Button>
    </section>
  )
}
