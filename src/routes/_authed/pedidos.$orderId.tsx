import { createFileRoute } from '@tanstack/react-router'
import { OrderPage } from '@/features/orders/components/order-page'

/** Order status + immutable receipt (`/pedidos/$orderId`, P4-02). Private (`_authed`). */
export const Route = createFileRoute('/_authed/pedidos/$orderId')({
  component: OrderRoute,
})

function OrderRoute() {
  const { orderId } = Route.useParams()
  return <OrderPage orderId={orderId} />
}
