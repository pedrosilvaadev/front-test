import { createFileRoute } from '@tanstack/react-router'
import { FavoritesPage } from '@/features/favorites/components/favorites-page'

/** Favorites "Lista de interesse" (`/favoritos`, P3-02). Private (`_authed`). */
export const Route = createFileRoute('/_authed/favoritos')({
  component: FavoritesPage,
})
