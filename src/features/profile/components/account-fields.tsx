import { ChevronDown, Eye, EyeOff } from 'lucide-react'
import { useState, type ComponentProps, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { accountInputClass, errorProps } from '../account-styles'

interface FieldProps {
  id: string
  label: string
  required?: boolean
  error?: string | undefined
  className?: string
  srOnlyLabel?: boolean
  children: ReactNode
}

/** Label + control + error (`<id>-error`, referenced by the control's `aria-describedby`). */
export function Field({ id, label, required, error, className, srOnlyLabel, children }: FieldProps) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-2', className)}>
      <label htmlFor={id} className={cn('text-[0.9375rem] tracking-[0.04em] text-foreground', srOnlyLabel && 'sr-only')}>
        {label}
        {required ? (
          <span aria-hidden="true" className="ml-0.5 text-brand">
            *
          </span>
        ) : null}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}

/** ENS input with the fixed `.eth` suffix box from the Figma ("Nome ENS"). */
export function EnsInput({ id, error, className, ...props }: ComponentProps<'input'> & { id: string; error?: string | undefined }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        aria-hidden="true"
        className="inline-flex h-12 shrink-0 items-center gap-3 rounded-[0.625rem] border border-border px-3 text-[0.8125rem] text-foreground md:h-10 md:rounded-[0.125rem]"
      >
        .eth
        <ChevronDown className="size-4 text-subtle-foreground" />
      </span>
      <input
        {...props}
        {...errorProps(id, error)}
        autoComplete="off"
        spellCheck={false}
        autoCapitalize="none"
        className={cn(accountInputClass, className)}
      />
    </div>
  )
}

/** Select with the chevron of the Figma fields. */
export function SelectInput({ id, error, className, children, ...props }: ComponentProps<'select'> & { id: string; error?: string | undefined }) {
  return (
    <div className="relative">
      <select {...props} {...errorProps(id, error)} className={cn(accountInputClass, 'appearance-none pr-10', className)}>
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-subtle-foreground"
      />
    </div>
  )
}

/** Password with show/hide toggle (`aria-pressed`); visible label (Figma "Alterar senha"). */
export function PasswordInput({
  id,
  error,
  toggleLabel,
  ...props
}: Omit<ComponentProps<'input'>, 'type'> & { id: string; error?: string | undefined; toggleLabel: string }) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <input
        {...props}
        {...errorProps(id, error)}
        type={visible ? 'text' : 'password'}
        spellCheck={false}
        autoCapitalize="none"
        className={cn(accountInputClass, 'pr-12')}
      />
      <button
        type="button"
        aria-label={toggleLabel}
        aria-pressed={visible}
        aria-controls={id}
        onClick={() => setVisible((value) => !value)}
        className="absolute inset-y-0 right-1 my-auto inline-flex size-9 items-center justify-center rounded-sm text-muted-foreground outline-none hover:text-brand focus-visible:ring-2 focus-visible:ring-ring"
      >
        {visible ? <Eye className="size-4" aria-hidden="true" /> : <EyeOff className="size-4" aria-hidden="true" />}
      </button>
    </div>
  )
}
