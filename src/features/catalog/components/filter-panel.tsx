import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Skeleton } from '@/components/ui/skeleton'
import { NETWORKS, type Network } from '@/contracts/common/primitives'
import { CATEGORIES, type CatalogFacets, type CatalogQuery, type Category } from '@/contracts/nfts'
import { cn } from '@/lib/utils'
import { CLEAR_FILTERS_PATCH, hasActiveFilters, toggleValue, type CatalogPatch } from '../catalog-search'
import { CATEGORY_LABELS, NETWORK_LABELS } from '../labels'
import { centsToEth, ethToCents, formatPriceBound } from '../price'

interface FilterPanelProps {
  query: CatalogQuery
  /** Counts and slider bounds; `undefined` until the first response arrives. */
  facets: CatalogFacets | undefined
  onChange: (patch: CatalogPatch) => void
  className?: string
}

const legendClass = 'mb-3 text-base font-bold tracking-[0.02em] text-foreground'

/**
 * Sidebar filters (Figma "Início"): Coleções, Faixa de preço, Rede. Shared by
 * the desktop sidebar and the mobile filter sheet. Every control is a native
 * labelled form control; collection/network toggles apply immediately, the
 * price range applies with "Aplicar".
 */
export function FilterPanel({ query, facets, onChange, className }: FilterPanelProps) {
  return (
    <div className={cn('flex flex-col gap-8', className)}>
      <CheckboxGroup
        legend="Coleções"
        values={CATEGORIES}
        selected={query.categories}
        labels={CATEGORY_LABELS}
        counts={facets?.categories}
        boldCounts
        onToggle={(value: Category) => onChange({ categories: toggleValue(query.categories, value) })}
      />
      <PriceRange query={query} facets={facets} onChange={onChange} />
      <CheckboxGroup
        legend="Rede"
        values={NETWORKS}
        selected={query.networks}
        labels={NETWORK_LABELS}
        counts={facets?.networks}
        onToggle={(value: Network) => onChange({ networks: toggleValue(query.networks, value) })}
      />
      {hasActiveFilters(query) ? (
        <Button
          type="button"
          variant="ghost"
          onClick={() => onChange(CLEAR_FILTERS_PATCH)}
          className="self-start rounded-sm px-3 text-sm text-brand underline-offset-4 hover:underline"
        >
          Limpar filtros
        </Button>
      ) : null}
    </div>
  )
}

interface CheckboxGroupProps<T extends string> {
  legend: string
  values: readonly T[]
  selected: readonly T[]
  labels: Record<T, string>
  counts: Record<T, number> | undefined
  boldCounts?: boolean
  onToggle: (value: T) => void
}

function CheckboxGroup<T extends string>({
  legend,
  values,
  selected,
  labels,
  counts,
  boldCounts = false,
  onToggle,
}: CheckboxGroupProps<T>) {
  return (
    <fieldset>
      <legend className={legendClass}>{legend}</legend>
      <ul className="flex flex-col">
        {values.map((value) => {
          const checked = selected.includes(value)
          const count = counts?.[value]
          return (
            <li key={value}>
              <label
                className={cn(
                  'flex min-h-10 cursor-pointer items-center justify-between gap-3 rounded-sm px-3 text-sm tracking-[0.04em] text-muted-foreground transition-colors hover:text-foreground',
                  'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
                  checked && 'text-brand hover:text-brand',
                )}
              >
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={checked}
                  onChange={() => onToggle(value)}
                />
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className={cn(
                      'size-1.5 shrink-0 rounded-full bg-brand transition-opacity',
                      checked ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  {labels[value]}
                </span>
                {count === undefined ? (
                  <Skeleton className="h-3.5 w-7 bg-secondary" />
                ) : (
                  <span className={cn('tabular-nums', boldCounts && 'font-bold')}>
                    <span className="sr-only">, </span>({count}
                    <span className="sr-only"> itens</span>)
                  </span>
                )}
              </label>
            </li>
          )
        })}
      </ul>
    </fieldset>
  )
}

interface PriceRangeProps {
  query: CatalogQuery
  facets: CatalogFacets | undefined
  onChange: (patch: CatalogPatch) => void
}

interface Bounds {
  min: number
  max: number
}

function clamp(value: number, { min, max }: Bounds): number {
  return Math.min(max, Math.max(min, value))
}

function PriceRange({ query, facets, onChange }: PriceRangeProps) {
  // Bounds outside safe slider positions (absurd prices) disable the slider instead of throwing.
  const minCents = facets ? ethToCents(facets.priceRange.min, 'floor') : null
  const maxCents = facets ? ethToCents(facets.priceRange.max, 'ceil') : null
  const bounds: Bounds | undefined =
    minCents !== null && maxCents !== null ? { min: minCents, max: maxCents } : undefined
  // A URL bound too large for a slider position sits at the top of the range.
  const urlCents = (amount: string, mode: 'floor' | 'ceil', range: Bounds) =>
    clamp(ethToCents(amount, mode) ?? range.max, range)
  const selection = (): [number, number] => {
    if (!bounds) return [0, 0]
    const low = query.minPrice !== undefined ? urlCents(query.minPrice, 'floor', bounds) : bounds.min
    const high = query.maxPrice !== undefined ? urlCents(query.maxPrice, 'ceil', bounds) : bounds.max
    return [low, Math.max(low, high)]
  }

  // Draft follows the URL/bounds until the user moves a thumb; reset when they change.
  const sourceKey = `${query.minPrice ?? ''}|${query.maxPrice ?? ''}|${bounds?.min ?? ''}|${bounds?.max ?? ''}`
  const [source, setSource] = useState(sourceKey)
  const [draft, setDraft] = useState<[number, number]>(selection)
  if (source !== sourceKey) {
    setSource(sourceKey)
    setDraft(selection())
  }

  const disabled = !bounds || bounds.max <= bounds.min
  const [low, high] = draft

  function apply() {
    if (!bounds) return
    onChange({
      minPrice: low > bounds.min ? centsToEth(low) : undefined,
      maxPrice: high < bounds.max ? centsToEth(high) : undefined,
    })
  }

  return (
    <fieldset>
      <legend className={legendClass}>Faixa de preço</legend>
      <div className="flex flex-col gap-3 px-3">
        <Slider
          min={bounds?.min ?? 0}
          max={disabled ? (bounds?.min ?? 0) + 1 : bounds.max}
          step={1}
          minStepsBetweenThumbs={0}
          value={draft}
          onValueChange={(next) => {
            const [a = 0, b = a] = next
            setDraft([a, b])
          }}
          disabled={disabled}
          thumbLabels={['Preço mínimo', 'Preço máximo']}
          getThumbValueText={(value) => `${formatPriceBound(centsToEth(value))} ETH`}
          className="py-2"
        />
        <div className="text-sm tracking-[0.02em] text-foreground">
          {bounds ? (
            <>
              Preço: {formatPriceBound(centsToEth(low))} - {formatPriceBound(centsToEth(high))} ETH
            </>
          ) : facets ? (
            <span className="text-muted-foreground">Faixa de preço indisponível</span>
          ) : (
            <Skeleton className="h-4 w-40 bg-secondary" />
          )}
        </div>
        <Button
          type="button"
          onClick={apply}
          disabled={disabled}
          className="h-8 self-start rounded-sm px-3 text-sm font-bold tracking-[0.04em]"
        >
          Aplicar
          <span className="sr-only"> faixa de preço</span>
        </Button>
      </div>
    </fieldset>
  )
}
