import { createFileRoute } from '@tanstack/react-router'
import { ProfileSummary } from '@/features/auth/components/profile-summary'

/** Minimal protected profile (P3-01). The full profile/edit screen is P3-02. */
export const Route = createFileRoute('/_authed/perfil')({
  component: ProfileSummary,
})
