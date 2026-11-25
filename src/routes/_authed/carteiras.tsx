import { createFileRoute } from '@tanstack/react-router'
import { WalletsPage } from '@/features/wallets/components/wallets-page'

/** Wallets (`/carteiras`, P3-02; Figma "Carteiras"). Private (`_authed`). */
export const Route = createFileRoute('/_authed/carteiras')({
  component: WalletsPage,
})
