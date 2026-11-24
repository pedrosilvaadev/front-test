import { createFileRoute } from '@tanstack/react-router'
import { CartPage } from '@/features/cart/components/cart-page'

/** Cart (`/carrinho`, P4-01): guest or user cart with the quote summary. Public route (ADR-006). */
export const Route = createFileRoute('/carrinho')({
  component: CartPage,
})
