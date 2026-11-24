import { useRef, type KeyboardEvent } from 'react'
import { CATALOG_TABS, type CatalogTab } from '@/contracts/nfts'
import { cn } from '@/lib/utils'
import { TAB_LABELS } from '../labels'

interface CatalogTabsProps {
  value: CatalogTab
  onChange: (tab: CatalogTab) => void
  /** id of the results region the tabs control. */
  controls: string
  className?: string
}

/**
 * "Todos os NFTs / Novos lançamentos / Em alta" (ARIA tabs, automatic
 * activation): arrow keys, Home and End move between tabs; only the selected
 * tab is in the tab order.
 */
export function CatalogTabs({ value, onChange, controls, className }: CatalogTabsProps) {
  const refs = useRef<Partial<Record<CatalogTab, HTMLButtonElement | null>>>({})

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = CATALOG_TABS.indexOf(value)
    let next: number | undefined
    if (event.key === 'ArrowRight') next = (index + 1) % CATALOG_TABS.length
    else if (event.key === 'ArrowLeft') next = (index - 1 + CATALOG_TABS.length) % CATALOG_TABS.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = CATALOG_TABS.length - 1
    const tab = next === undefined ? undefined : CATALOG_TABS[next]
    if (!tab) return
    event.preventDefault()
    onChange(tab)
    refs.current[tab]?.focus()
  }

  return (
    <div
      role="tablist"
      aria-label="Listagens"
      onKeyDown={onKeyDown}
      className={cn('flex items-center gap-x-2.5 overflow-x-auto md:gap-x-5', className)}
    >
      {CATALOG_TABS.map((tab) => {
        const selected = tab === value
        return (
          <button
            key={tab}
            id={`catalog-tab-${tab}`}
            ref={(node) => {
              refs.current[tab] = node
            }}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={controls}
            tabIndex={selected ? 0 : -1}
            onClick={() => {
              if (!selected) onChange(tab)
            }}
            className={cn(
              'relative shrink-0 rounded-sm py-1.5 text-sm tracking-[0.02em] whitespace-nowrap text-foreground outline-none',
              'after:absolute after:inset-x-0 after:bottom-0 after:h-[2px] after:rounded-full after:bg-primary after:opacity-0',
              'focus-visible:ring-2 focus-visible:ring-ring hover:text-brand',
              selected ? 'font-bold text-brand after:opacity-100 md:font-normal' : 'md:font-bold',
            )}
          >
            {TAB_LABELS[tab]}
          </button>
        )
      })}
    </div>
  )
}
