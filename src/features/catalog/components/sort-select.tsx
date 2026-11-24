import { useId } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CATALOG_SORTS, catalogSortSchema, type CatalogSort } from '@/contracts/nfts'
import { cn } from '@/lib/utils'
import { SORT_LABELS } from '../labels'

interface SortSelectProps {
  value: CatalogSort
  onChange: (sort: CatalogSort) => void
  className?: string
}

/** "Ordenar por: Listados recentemente" (Figma "Início"). */
export function SortSelect({ value, onChange, className }: SortSelectProps) {
  const labelId = useId()
  return (
    <div className={cn('flex items-center gap-1 text-sm tracking-[0.02em]', className)}>
      <span id={labelId} className="text-foreground">
        Ordenar por:
      </span>
      <Select
        value={value}
        onValueChange={(next) => {
          const parsed = catalogSortSchema.safeParse(next)
          if (parsed.success) onChange(parsed.data)
        }}
      >
        <SelectTrigger
          aria-labelledby={labelId}
          className="h-8 gap-1 rounded-sm border-0 bg-transparent px-1 text-sm text-foreground shadow-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-transparent dark:hover:bg-transparent [&_svg:not([class*='text-'])]:text-foreground"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" align="end" className="rounded-sm">
          {CATALOG_SORTS.map((sort) => (
            <SelectItem key={sort} value={sort} className="text-sm">
              {SORT_LABELS[sort]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
