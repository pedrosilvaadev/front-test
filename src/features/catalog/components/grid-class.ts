import { cn } from '@/lib/utils'

/**
 * Catalog grid: 2 staggered columns on mobile (Figma mobile "Início": every
 * second card sits lower), 2 columns on tablets, 3 on desktop. The stagger
 * is a transform so DOM/reading order stays row by row; bottom padding keeps
 * the shifted last card clear of the pagination.
 */
export const gridClass = cn(
  'grid grid-cols-2 gap-x-4 gap-y-6 max-md:pb-10 max-md:[&>li:nth-child(even)]:translate-y-10',
  'md:gap-x-6 md:gap-y-10 lg:grid-cols-3 lg:gap-x-[2.125rem] lg:gap-y-12',
)
