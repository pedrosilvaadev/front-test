import type * as React from 'react'
import { lazy, Suspense, useEffect, useState } from 'react'
import { MobileTabBar } from './mobile-tab-bar'
import { SiteFooter } from './site-footer'
import { SiteHeader } from './site-header'

const MAIN_CONTENT_ID = 'main-content'

/**
 * Realtime connection (P5-01) in its own chunk, with `socket.io-client` loaded
 * on demand. Mounted once the browser is idle after the first render, so the
 * socket chunk and handshake never compete with the first paint/LCP (P6-02);
 * missed updates in that window are covered by the REST data just loaded.
 */
const RealtimeBridge = lazy(() =>
  import('@/features/realtime/realtime-bridge').then((module) => ({ default: module.RealtimeBridge })),
)

function useIdle(): boolean {
  const [idle, setIdle] = useState(false)
  useEffect(() => {
    if (typeof window.requestIdleCallback === 'function') {
      const handle = window.requestIdleCallback(() => setIdle(true), { timeout: 2000 })
      return () => window.cancelIdleCallback(handle)
    }
    const handle = window.setTimeout(() => setIdle(true), 200)
    return () => window.clearTimeout(handle)
  }, [])
  return idle
}

interface AppLayoutProps {
  children: React.ReactNode
}

/**
 * Page chrome shared by every route: skip link, header (desktop bar or
 * mobile search bar), main landmark, footer and the mobile tab bar.
 * Breakpoint switch at `md` (768px).
 */
export function AppLayout({ children }: AppLayoutProps) {
  const idle = useIdle()
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
      {idle ? (
        <Suspense fallback={null}>
          <RealtimeBridge />
        </Suspense>
      ) : null}
    </div>
  )
}
