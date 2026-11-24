/**
 * Internal paths of screens delivered by later slices (P3 auth/profile,
 * P4 cart/favorites). They are not registered in the route tree yet, so they
 * currently render the not-found page; TanStack's typed `<Link to>` rejects
 * unregistered paths, hence `PlannedRouteLink` uses a plain anchor until the
 * owning slice adds the route and switches the call sites to `<Link>`.
 */
export const PLANNED_ROUTES = {
  favorites: '/favoritos',
  cart: '/carrinho',
  profile: '/perfil',
  login: '/login',
} as const

export type PlannedRoute = (typeof PLANNED_ROUTES)[keyof typeof PLANNED_ROUTES]

/** Text appended (visually hidden) to the accessible name of every unavailable entry point. */
export const UNAVAILABLE_SUFFIX = '(em breve)'
