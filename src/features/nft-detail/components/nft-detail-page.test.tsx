import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { setScenario } from '@/mocks/scenario'
import { renderApp } from '@/test/render-app'
import { APP_READY_TIMEOUT, APP_TEST_TIMEOUT } from '@/test/timeouts'

async function readyDetail(path = '/nft/emerald-ape-042') {
  const utils = renderApp({ initialPath: path })
  const article = await screen.findByTestId('nft-detail', {}, { timeout: APP_READY_TIMEOUT })
  return { ...utils, article }
}

function desktopStepper() {
  return within(screen.getByTestId('desktop-purchase')).getByRole('group', { name: 'Quantidade' })
}

describe('NFT detail page', { timeout: APP_TEST_TIMEOUT }, () => {
  it('renders the API data with a single h1 and updates the document title', async () => {
    await readyDetail()
    const h1 = screen.getAllByRole('heading', { level: 1 })
    expect(h1).toHaveLength(1)
    expect(h1[0]).toHaveTextContent('Emerald Ape #042')
    await waitFor(() => expect(document.title).toBe('Emerald Ape #042 | Kurio'))
    expect(screen.getAllByTestId('nft-price')[0]).toHaveTextContent('1.19 ETH')
    expect(screen.getByText('#0042')).toBeInTheDocument()
    expect(screen.getByText('Kurio Apes')).toBeInTheDocument()
    expect(screen.getByText('Óculos, Esmeralda, Raro')).toBeInTheDocument()
    const breadcrumb = screen.getByRole('navigation', { name: 'Trilha de navegação' })
    expect(within(breadcrumb).getByRole('link', { name: 'Início' })).toHaveAttribute('href', '/')
    expect(breadcrumb).toHaveTextContent('Mercado')
    expect(screen.getByRole('tab', { name: 'Avaliações de colecionadores (19)' })).toBeInTheDocument()
    expect(screen.getByText(/0x[0-9a-f]{4}\.\.\.[0-9a-f]{4}/)).toBeInTheDocument()
  })

  it('works by id as well as slug', async () => {
    await readyDetail('/nft/nft_001')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Emerald Ape #042')
  })

  it('switches editions in a radiogroup and bounds the stepper per edition', async () => {
    await readyDetail()
    const group = screen.getByRole('radiogroup', { name: 'Edição:' })
    const option = (label: string) => within(group).getByRole('radio', { name: label })
    expect(option('1/1')).toBeChecked()
    expect(screen.getByTestId('edition-availability')).toHaveTextContent('1 disponível · máx. 1 por pedido')

    const stepper = desktopStepper()
    const plus = within(stepper).getByRole('button', { name: 'Aumentar quantidade' })
    const minus = within(stepper).getByRole('button', { name: 'Diminuir quantidade' })
    expect(plus).toBeDisabled()
    expect(minus).toBeDisabled()

    // 1/50: available 10, maxPerOrder 5 → max 5.
    fireEvent.click(option('1/50'))
    expect(option('1/50')).toBeChecked()
    expect(plus).toBeEnabled()
    for (let i = 0; i < 6; i += 1) fireEvent.click(plus)
    expect(within(stepper).getByRole('status')).toHaveTextContent('5')
    expect(plus).toBeDisabled()
    // The mobile bar shares the selection; subtotal is decimal price × quantity.
    expect(screen.getByTestId('mobile-subtotal')).toHaveTextContent('5.95 ETH')

    // 1/10: available 2 → quantity clamps to 2.
    fireEvent.click(option('1/10'))
    expect(within(stepper).getByRole('status')).toHaveTextContent('2')
    expect(plus).toBeDisabled()
    fireEvent.click(minus)
    expect(within(stepper).getByRole('status')).toHaveTextContent('1')
    expect(minus).toBeDisabled()
  })

  it('disables sold-out editions', async () => {
    await readyDetail('/nft/neon-vessel-552')
    const group = screen.getByRole('radiogroup', { name: 'Edição:' })
    expect(within(group).getByRole('radio', { name: '1/1 (esgotada)' })).toBeDisabled()
    expect(within(group).getByRole('radio', { name: '1/10' })).toBeChecked()
    expect(screen.getAllByTestId('nft-price')[0]?.parentElement).toHaveTextContent('2.29 ETH')
  })

  it('renders COMPRAR, Favoritar and cart as unavailable actions without side effects', async () => {
    const { router } = await readyDetail()
    const before = router.state.location.href
    for (const name of [/^COMPRAR/, /^Favoritar/, /^Comprar NFT/, /Adicionar ao carrinho/]) {
      for (const button of screen.getAllByRole('button', { name })) {
        expect(button).toHaveAttribute('aria-disabled', 'true')
        expect(button).toHaveAccessibleName(/\(em breve\)/)
        fireEvent.click(button)
      }
    }
    expect(router.state.location.href).toBe(before)
  })

  it('switches the main image from the thumbnails and opens the zoom dialog', async () => {
    await readyDetail()
    const thumbs = within(screen.getByRole('list', { name: 'Imagens do NFT' })).getAllByRole('button')
    expect(thumbs).toHaveLength(4)
    expect(thumbs[0]).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(thumbs[2]!)
    expect(thumbs[2]).toHaveAttribute('aria-pressed', 'true')
    expect(thumbs[0]).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByTestId('nft-main-image')).toHaveAccessibleName('Emerald Ape #042, vista 3 de 4')

    const zoom = screen.getByRole('button', { name: 'Ampliar imagem' })
    fireEvent.click(zoom)
    const dialog = await screen.findByRole('dialog', { name: 'Emerald Ape #042' })
    expect(within(dialog).getByRole('img')).toHaveAccessibleName('Emerald Ape #042, vista 3 de 4')
    fireEvent.keyDown(dialog, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(zoom).toHaveFocus())
  })

  it('lists related NFTs as router links', async () => {
    await readyDetail()
    const list = await screen.findByRole('list', { name: 'NFTs relacionados' }, { timeout: APP_READY_TIMEOUT })
    const links = within(list).getAllByRole('link')
    expect(links.length).toBeGreaterThan(0)
    expect(links.map((link) => link.getAttribute('href'))).not.toContain('/nft/emerald-ape-042')
    for (const link of links) expect(link.getAttribute('href')).toMatch(/^\/nft\/[a-z0-9-]+$/)
  })

  it('renders "NFT não encontrado" for an unknown NFT', async () => {
    renderApp({ initialPath: '/nft/nao-existe-999' })
    const heading = await screen.findByRole('heading', { level: 1, name: 'NFT não encontrado' }, { timeout: APP_READY_TIMEOUT })
    const section = heading.closest('section')!
    expect(section).toHaveTextContent('404')
    expect(within(section).getByRole('link', { name: 'Voltar ao catálogo' })).toHaveAttribute('href', '/#catalogo')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await waitFor(() => expect(document.title).toBe('NFT não encontrado | Kurio'))
  })

  it('shows a retryable error state for server errors', async () => {
    setScenario({
      name: 'detail-error',
      latency: { type: 'none' },
      failure: { type: 'http', status: 500, code: 'INTERNAL_ERROR' },
      seed: 1,
      pathPrefix: '/api/nfts/emerald-ape-042',
    })
    renderApp({ initialPath: '/nft/emerald-ape-042' })
    const alert = await screen.findByRole('alert', {}, { timeout: APP_READY_TIMEOUT })
    expect(alert).toHaveTextContent('Não foi possível carregar o NFT')
    expect(screen.queryByText('NFT não encontrado')).not.toBeInTheDocument()

    setScenario('default')
    fireEvent.click(within(alert).getByRole('button', { name: 'Tentar novamente' }))
    expect(await screen.findByTestId('nft-detail', {}, { timeout: APP_READY_TIMEOUT })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Emerald Ape #042')
  })
})
