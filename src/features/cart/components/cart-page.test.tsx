import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { addItem } from '@/mocks/cart-store'
import { renderApp } from '@/test/render-app'
import { APP_READY_TIMEOUT, APP_TEST_TIMEOUT } from '@/test/timeouts'
import { GUEST_CART_STORAGE_KEY } from '../guest-cart-id'

const GUEST = '33333333-3333-4333-8333-333333333333'
const wait = { timeout: APP_READY_TIMEOUT }

function seedGuestCart() {
  window.localStorage.setItem(GUEST_CART_STORAGE_KEY, GUEST)
  const owner = { kind: 'guest' as const, guestCartId: GUEST }
  addItem(owner, { nftId: 'nft_001', editionId: 'nft_001-1of50', quantity: 2 })
  addItem(owner, { nftId: 'nft_001', editionId: 'nft_001-open', quantity: 6 })
}

async function expectTotals(subtotal: string, discount: string, total: string) {
  await waitFor(() => {
    expect(screen.getByTestId('cart-subtotal')).toHaveTextContent(subtotal)
    expect(screen.getByTestId('cart-discount')).toHaveTextContent(discount)
    expect(screen.getByTestId('cart-fee')).toHaveTextContent('0.016 ETH')
    expect(screen.getByTestId('cart-total')).toHaveTextContent(total)
  }, wait)
}

describe('cart page (/carrinho)', { timeout: APP_TEST_TIMEOUT }, () => {
  beforeEach(() => window.localStorage.clear())

  it('shows the empty state for a guest without a cart (no request)', async () => {
    renderApp({ initialPath: '/carrinho' })
    const empty = await screen.findByTestId('cart-empty', {}, wait)
    expect(within(empty).getByRole('link', { name: 'Explorar NFTs' })).toHaveAttribute('href', '/#catalogo')
    expect(window.localStorage.getItem(GUEST_CART_STORAGE_KEY)).toBeNull()
  })

  it('renders lines and quote totals, updates quantity, applies a coupon and removes lines', async () => {
    seedGuestCart()
    renderApp({ initialPath: '/carrinho' })
    const lines = await screen.findAllByTestId('cart-line', {}, wait)
    expect(lines).toHaveLength(2)
    await expectTotals('9.52 ETH', '(-) 0.00 ETH', '9.536 ETH')
    await waitFor(() => expect(within(lines[0]!).getAllByTestId('cart-line-total')[0]).toHaveTextContent('2.38 ETH'), wait)
    await waitFor(() => expect(screen.getAllByRole('link', { name: 'Carrinho, 8 itens' }).length).toBeGreaterThan(0), wait)

    // Quantity: absolute PATCH; totals come from the new quote.
    fireEvent.click(within(lines[0]!).getByRole('button', { name: 'Aumentar quantidade' }))
    await waitFor(() => expect(within(lines[0]!).getByTestId('cart-line-quantity')).toHaveTextContent('3'), wait)
    await expectTotals('10.71 ETH', '(-) 0.00 ETH', '10.726 ETH')

    // Invalid coupon → inline error; valid (lower case) → discount from the quote.
    const input = screen.getByRole('textbox', { name: 'Código promocional' })
    fireEvent.change(input, { target: { value: 'nope' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
    expect(await screen.findByTestId('coupon-error', {}, wait)).toHaveTextContent('Cupom inválido')
    fireEvent.change(input, { target: { value: 'kurio10' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
    expect(await screen.findByTestId('applied-coupon', {}, wait)).toHaveTextContent('KURIO10')
    await expectTotals('10.71 ETH', '(-) 1.071 ETH', '9.655 ETH')

    // Remove a line (two buttons share the name: mobile/desktop layouts).
    fireEvent.click(within(lines[1]!).getAllByRole('button', { name: /^Remover Emerald Ape #042 do carrinho$/ })[0]!)
    await waitFor(() => expect(screen.getAllByTestId('cart-line')).toHaveLength(1), wait)
    await expectTotals('3.57 ETH', '(-) 0.357 ETH', '3.229 ETH')
  })

  it('shows an availability conflict inline with the allowed max', async () => {
    seedGuestCart()
    renderApp({ initialPath: '/carrinho' })
    const [line] = await screen.findAllByTestId('cart-line', {}, wait)
    await expectTotals('9.52 ETH', '(-) 0.00 ETH', '9.536 ETH')
    // Stock drops behind the page's back (another buyer): 1/50 now has 2 left.
    const { patchNft } = await import('@/mocks/catalog')
    patchNft('nft_001', { editions: [{ id: 'nft_001-1of50', available: 2 }] })
    fireEvent.click(within(line!).getByRole('button', { name: 'Aumentar quantidade' }))
    expect(await within(line!).findByTestId('cart-line-error', {}, wait)).toHaveTextContent(
      'o máximo permitido para esta edição é 2 unidades',
    )
    expect(within(line!).getByTestId('cart-line-quantity')).toHaveTextContent('2')
  })
})
