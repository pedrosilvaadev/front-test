import { Eye, EyeOff } from 'lucide-react'
import { forwardRef, useId, useState, type ComponentProps } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

/** Figma: 40px square-ish fields on desktop, 50px rounded fields on mobile. */
const authInputClass =
  'h-[3.125rem] rounded-[0.625rem] bg-transparent text-sm tracking-[0.02em] md:h-10 md:rounded-[0.125rem] md:text-[0.8125rem]'

interface FieldProps extends Omit<ComponentProps<'input'>, 'id'> {
  /** Accessible label (visually hidden: the Figma fields only show placeholders). */
  label: string
  error?: string
  inputClassName?: string
}

function FieldError({ id, error }: { id: string; error?: string }) {
  if (!error) return null
  return (
    <p id={id} className="text-xs text-destructive">
      {error}
    </p>
  )
}

/** Labelled input with its error linked through `aria-describedby`. */
export const AuthTextField = forwardRef<HTMLInputElement, FieldProps>(function AuthTextField(
  { label, error, className, inputClassName, ...props },
  ref,
) {
  const id = useId()
  const errorId = `${id}-error`
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={id} className="sr-only">
        {label}
      </Label>
      <Input
        ref={ref}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={cn(authInputClass, inputClassName)}
        {...props}
      />
      <FieldError id={errorId} error={error} />
    </div>
  )
})

/** Password input with a show/hide toggle (`aria-pressed`); the value only lives in component state. */
interface PasswordFieldProps extends Omit<FieldProps, 'type'> {
  /** Accessible name of the show/hide toggle (state is exposed with `aria-pressed`). */
  toggleLabel: string
}

export const PasswordField = forwardRef<HTMLInputElement, PasswordFieldProps>(function PasswordField(
  { label, toggleLabel, error, className, inputClassName, ...props },
  ref,
) {
  const id = useId()
  const errorId = `${id}-error`
  const [visible, setVisible] = useState(false)
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={id} className="sr-only">
        {label}
      </Label>
      <div className="relative">
        <Input
          ref={ref}
          id={id}
          type={visible ? 'text' : 'password'}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          // Never let the browser spellcheck/translate a revealed password.
          spellCheck={false}
          autoCapitalize="none"
          className={cn(authInputClass, 'pr-12', inputClassName)}
          {...props}
        />
        <button
          type="button"
          aria-label={toggleLabel}
          aria-pressed={visible}
          aria-controls={id}
          onClick={() => setVisible((value) => !value)}
          className="absolute inset-y-0 right-1 my-auto inline-flex size-9 items-center justify-center rounded-sm text-muted-foreground outline-none hover:text-brand focus-visible:ring-2 focus-visible:ring-ring"
        >
          {visible ? <Eye className="size-5" aria-hidden="true" /> : <EyeOff className="size-5" aria-hidden="true" />}
        </button>
      </div>
      <FieldError id={errorId} error={error} />
    </div>
  )
})
