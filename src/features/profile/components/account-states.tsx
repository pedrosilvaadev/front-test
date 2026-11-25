import { primaryButtonClass } from '../account-styles'

/** Loading placeholder for account sections (announced politely). */
export function AccountLoading({ label }: { label: string }) {
  return (
    <div aria-busy="true" aria-live="polite" className="flex flex-col gap-4">
      <span className="sr-only">{label}</span>
      <div className="h-5 w-48 animate-pulse rounded-sm bg-card" />
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-10 animate-pulse rounded-sm bg-card" />
        ))}
      </div>
    </div>
  )
}

/** Retryable load failure for account sections. */
export function AccountError({ onRetry, retrying, message }: { onRetry: () => void; retrying: boolean; message?: string }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-sm bg-card p-6">
      <p className="text-sm text-foreground">{message ?? 'Não foi possível carregar seus dados. Tente novamente.'}</p>
      <button type="button" className={primaryButtonClass} onClick={onRetry} disabled={retrying}>
        Tentar novamente
      </button>
    </div>
  )
}
