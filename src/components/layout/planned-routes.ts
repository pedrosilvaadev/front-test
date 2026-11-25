/**
 * `/carrinho` is registered since P4-01 (header and tab bar use `<Link>`).
 *
 * `/favoritos` and `/carteiras` are registered since P3-02 (tab bar and the
 * account menu use `<Link>`).
 *
 * `/perfil` and `/login` are registered since P3-01 (header and tab bar use
 * `<Link>`); `favorites`/`profile` stay here only for the footer's plain
 * links, which work as full page loads.
 */
export const PLANNED_ROUTES = {
  favorites: '/favoritos',
  profile: '/perfil',
} as const

export type PlannedRoute = (typeof PLANNED_ROUTES)[keyof typeof PLANNED_ROUTES]

/** Text appended (visually hidden) to the accessible name of every unavailable entry point. */
export const UNAVAILABLE_SUFFIX = '(em breve)'
