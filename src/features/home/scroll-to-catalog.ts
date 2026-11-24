import { CATALOG_ANCHOR_ID } from './content'

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Brings the catalog block into view and moves focus to it, so keyboard and
 * screen-reader users land where sighted users are taken. Smooth scrolling
 * is skipped under `prefers-reduced-motion`. Returns `false` when the
 * catalog is not on the page (the caller then lets the link navigate).
 */
export function scrollToCatalog(): boolean {
  const target = document.getElementById(CATALOG_ANCHOR_ID)
  if (!target) return false
  target.scrollIntoView({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  target.focus({ preventScroll: true })
  return true
}
