import { RadioGroup, RadioGroupChip } from '@/components/ui/radio-group'
import type { Edition } from '@/contracts'
import type { PurchaseSelection } from '../purchase-selection'

interface EditionPickerProps {
  editions: readonly Edition[]
  selection: PurchaseSelection
}

function availabilityText(selection: PurchaseSelection): string {
  const { edition, bounds, soldOut } = selection
  if (!edition || soldOut) return 'Esgotado: nenhuma edição disponível no momento.'
  const units = edition.available === 1 ? '1 disponível' : `${String(edition.available)} disponíveis`
  return `${units} · máx. ${String(bounds.max)} por pedido`
}

/**
 * "Edição:" chips as an ARIA radio group (Radix: arrow keys move and select,
 * sold-out editions are disabled and skipped).
 */
export function EditionPicker({ editions, selection }: EditionPickerProps) {
  return (
    <div className="flex flex-col gap-2">
      <p id="edition-label" className="text-[0.9375rem] font-bold tracking-[0.04em] text-foreground md:text-sm">
        Edição:
      </p>
      <RadioGroup
        aria-labelledby="edition-label"
        aria-describedby="edition-availability"
        value={selection.edition?.id ?? ''}
        onValueChange={selection.selectEdition}
        className="flex flex-wrap gap-2"
      >
        {editions.map((edition) => {
          const soldOut = edition.available < 1
          return (
            <RadioGroupChip
              key={edition.id}
              value={edition.id}
              disabled={soldOut}
              aria-label={soldOut ? `${edition.label} (esgotada)` : undefined}
              title={soldOut ? 'Edição esgotada' : undefined}
              data-testid="edition-option"
            >
              {edition.label}
            </RadioGroupChip>
          )
        })}
      </RadioGroup>
      <p id="edition-availability" className="text-xs tracking-[0.02em] text-subtle-foreground" data-testid="edition-availability">
        {availabilityText(selection)}
      </p>
    </div>
  )
}
