import type * as React from 'react'
import { lazy, Suspense } from 'react'
import { MobileTabBar } from './mobile-tab-bar'
import { SiteFooter } from './site-footer'
import { SiteHeader } from './site-header'

const MAIN_CONTENT_ID = 'main-content'

/** Realtime connection (P5-01) in its own chunk, with `socket.io-client` loaded on demand. */
const RealtimeBridge = lazy(() =>
  import('@/features/realtime/realtime-bridge').then((module) => ({ default: module.RealtimeBridge })),
)

interface AppLayoutProps {
  children: React.ReactNode
}

/**
 * Page chrome shared by every route: skip link, header (desktop bar or
 * mobile search bar), main landmark, footer and the mobile tab bar.
 * Breakpoint switch at `md` (768px).
 */
export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground max-md:pb-[calc(var(--tab-bar-height)+env(safe-area-inset-bottom)+1rem)]">
      <a
        href={`#${MAIN_CONTENT_ID}`}
        className="sr-only z-50 rounded-sm bg-primary px-4 py-2 font-bold text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
      >
        Pular para o conteúdo
      </a>
      <SiteHeader />
      <main
        id={MAIN_CONTENT_ID}
        tabIndex={-1}
        className="mx-auto w-full max-w-[75rem] flex-1 px-6 py-6 outline-none md:py-8 xl:px-0"
      >
        {children}
      </main>
      <SiteFooter />
      <MobileTabBar />
      <Suspense fallback={null}>
        <RealtimeBridge />
      </Suspense>
    </div>
  )
}
