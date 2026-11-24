import type * as React from 'react'
import type { PlannedRoute } from './planned-routes'

interface PlannedRouteLinkProps extends Omit<React.ComponentProps<'a'>, 'href'> {
  to: PlannedRoute
}

/**
 * Link to a screen owned by a later slice (see `PLANNED_ROUTES`). Plain anchor
 * because the path is not in the typed route tree yet; replace with
 * `<Link>` when the route is registered.
 */
export function PlannedRouteLink({ to, ...props }: PlannedRouteLinkProps) {
  return <a href={to} {...props} />
}
