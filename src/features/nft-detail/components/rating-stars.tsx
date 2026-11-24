import { Star } from 'lucide-react'
import { cn } from '@/lib/utils'
import { filledStars } from '../format'

/** Five stars filled from the API rating average; one accessible label for the group. */
export function RatingStars({ average, className }: { average: string; className?: string }) {
  const filled = filledStars(average)
  return (
    <span role="img" aria-label={`Nota ${average} de 5`} className={cn('inline-flex items-center gap-0.5', className)}>
      {Array.from({ length: 5 }, (_, index) => (
        <Star
          key={index}
          aria-hidden="true"
          className={cn('size-3.5', index < filled ? 'fill-brand text-brand' : 'text-subtle-foreground')}
        />
      ))}
    </span>
  )
}
