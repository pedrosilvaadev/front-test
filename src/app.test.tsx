import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderApp } from '@/test/render-app'

describe('app shell', () => {
  it('renders the home page inside the root layout', async () => {
    const { router } = renderApp()

    expect(
      await screen.findByRole('heading', { level: 1, name: 'NFT Marketplace' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'KURIO' })).toHaveAttribute('href', '/')
    // P2-02: the home renders the catalog instead of the placeholder.
    expect(await screen.findByRole('list', { name: 'NFTs' }, { timeout: 5000 })).toBeInTheDocument()
    expect(router.options.context.queryClient).toBeDefined()
  })

  it('renders the not-found component for unknown routes', async () => {
    renderApp({ initialPath: '/does-not-exist' })

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to home' })).toHaveAttribute('href', '/')
  })
})
