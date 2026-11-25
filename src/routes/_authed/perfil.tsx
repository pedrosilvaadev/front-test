import { createFileRoute } from '@tanstack/react-router'
import { ProfilePage } from '@/features/profile/components/profile-page'

/** Collector profile (`/perfil`, P3-02; Figma "Perfil do colecionador"). Private (`_authed`). */
export const Route = createFileRoute('/_authed/perfil')({
  component: ProfilePage,
})
