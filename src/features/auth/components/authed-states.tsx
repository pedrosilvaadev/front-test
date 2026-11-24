import { useRouter, type ErrorComponentProps } from '@tanstack/react-router'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { apiErrorKind } from '../session-bridge'

/** Shown while the guard revalidates the session; never renders private data. */
export function AuthedPending() {
  return (
    <div aria-busy="true" aria-live="polite" className="flex flex-col gap-4">
      <span className="sr-only">Verificando sua sessão…</span>
      <Skeleton aria-hidden="true" className="h-8 w-48 bg-card" />
      <Skeleton aria-hidden="true" className="h-40 w-full bg-card" />
    </div>
  )
}

function message(error: unknown): string {
  // Duck-typed (no `src/api/errors` import): this component sits in the entry chunk.
  const kind = apiErrorKind(error)
  if (kind === 'network') return 'Sem conexão com o servidor. Verifique sua internet e tente novamente.'
  if (kind === 'timeout') return 'O servidor demorou demais para responder. Tente novamente.'
  if (kind === 'transient') return 'O serviço está temporariamente indisponível. Tente novamente.'
  return 'Não foi possível verificar sua sessão.'
}

/** Session check failed for a non-auth reason (offline, 5xx): retry re-runs the guard. */
export function AuthedError({ error, reset }: ErrorComponentProps) {
  const router = useRouter()
  return (
    <section role="alert" className="flex flex-col items-start gap-4 rounded-card bg-card p-6 md:p-10">
      <AlertTriangle className="size-8 text-brand" aria-hidden="true" />
      <h1 className="text-xl font-bold tracking-[0.04em]">Não foi possível abrir esta página</h1>
      <p className="text-muted-foreground">{message(error)}</p>
      <Button
        type="button"
        className="rounded-sm font-bold"
        onClick={() => {
          reset()
          void router.invalidate()
        }}
      >
        Tentar novamente
      </Button>
    </section>
  )
}
