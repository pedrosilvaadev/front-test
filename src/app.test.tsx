import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderApp } from '@/test/render-app'

describe('app shell', () => {
  it('renders the home page inside the root layout', async () => {
    const { router } = renderApp()

    expect(
      await screen.findByRole('heading', { level: 1, name: 'NFT Marketplace' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'NFT Marketplace' })).toHaveAttribute('href', '/')
    expect(screen.getByText(/catalog is pending/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Browse catalog' })).toBeDisabled()
    expect(router.options.context.queryClient).toBeDefined()
  })

  it('renders the not-found component for unknown routes', async () => {
    renderApp({ initialPath: '/does-not-exist' })

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to home' })).toHaveAttribute('href', '/')
  })
})
