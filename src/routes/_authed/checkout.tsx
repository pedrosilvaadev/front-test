import { createFileRoute } from '@tanstack/react-router'
import { CheckoutPage } from '@/features/checkout/components/checkout-page'

/** Checkout (`/checkout`, P4-02). Private: guests are redirected to login and back (`_authed`). */
export const Route = createFileRoute('/_authed/checkout')({
  component: CheckoutPage,
})
