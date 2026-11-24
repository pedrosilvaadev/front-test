import { Link } from '@tanstack/react-router'
import { AlertTriangle } from 'lucide-react'
import { isApiError } from '@/api/errors'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/**
 * Loading placeholder with the footprint of the loaded page (gallery,
 * info column, tabs) so nothing jumps when the data arrives.
 */
export function NftDetailSkeleton() {
  return (
    <div aria-hidden="true" data-testid="nft-detail-skeleton" className="flex flex-col gap-8">
      <Skeleton className="hidden h-4 w-36 bg-card md:block" />
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-8 lg:grid-cols-[minmax(0,35.5rem)_minmax(0,1fr)]">
        <div className="flex gap-4 lg:gap-6">
          <div className="hidden w-16 shrink-0 flex-col gap-3 md:flex lg:w-[6.25rem] lg:gap-4">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="aspect-square w-full rounded-sm bg-card" />
            ))}
          </div>
          <Skeleton className="aspect-square min-w-0 flex-1 rounded-[1.5rem] bg-card md:rounded-sm" />
        </div>
        <div className="flex flex-col gap-4">
          <Skeleton className="h-8 w-2/3 bg-card" />
          <Skeleton className="h-6 w-1/3 bg-card" />
          <Skeleton className="h-4 w-1/4 bg-card" />
          <Skeleton className="h-16 w-full bg-card" />
          <Skeleton className="h-7 w-1/2 bg-card" />
          <Skeleton className="h-10 w-full bg-card" />
          <Skeleton className="h-16 w-2/3 bg-card" />
        </div>
      </div>
      <Skeleton className="h-40 w-full bg-card" />
    </div>
  )
}

/** "NFT não encontrado" (API 404 `NFT_NOT_FOUND`): a 404 page inside the shell. */
export function NftNotFound({ idOrSlug }: { idOrSlug: string }) {
  return (
    <section
      aria-labelledby="nft-not-found-title"
      data-testid="nft-not-found"
      className="flex flex-col items-start gap-4 rounded-card bg-card p-6 md:p-10"
    >
      <p className="text-sm font-bold tracking-[0.12em] text-brand">404</p>
      <h1 id="nft-not-found-title" className="text-2xl font-bold tracking-[0.04em]">
        NFT não encontrado
      </h1>
      <p className="max-w-prose break-words text-muted-foreground">
        Não existe nenhum NFT com o identificador “{idOrSlug}”. Ele pode ter sido removido ou o endereço está incorreto.
      </p>
      <Button asChild className="rounded-sm font-bold">
        <Link to="/" hash="catalogo">
          Voltar ao catálogo
        </Link>
      </Button>
    </section>
  )
}

interface NftDetailErrorProps {
  error: unknown
  onRetry: () => void
  retrying: boolean
}

function errorMessage(error: unknown): string {
  if (isApiError(error)) {
    if (error.kind === 'network') return 'Sem conexão com o servidor. Verifique sua internet e tente novamente.'
    if (error.kind === 'timeout') return 'O servidor demorou demais para responder. Tente novamente.'
    if (error.kind === 'transient') return 'O serviço está temporariamente indisponível. Tente novamente.'
  }
  return 'Ocorreu um erro inesperado ao carregar este NFT.'
}

/** Any non-404 failure: message by error kind and a retry button. */
export function NftDetailError({ error, onRetry, retrying }: NftDetailErrorProps) {
  return (
    <section
      role="alert"
      aria-labelledby="nft-error-title"
      data-testid="nft-detail-error"
      className="flex flex-col items-center gap-4 rounded-card bg-card px-6 py-12 text-center"
    >
      <AlertTriangle className="size-10 text-destructive" aria-hidden="true" />
      <h1 id="nft-error-title" className="text-lg font-bold tracking-[0.04em]">
        Não foi possível carregar o NFT
      </h1>
      <p className="max-w-sm text-sm text-muted-foreground">{errorMessage(error)}</p>
      <Button
        type="button"
        onClick={onRetry}
        disabled={retrying}
        className={cn('rounded-sm font-bold', retrying && 'cursor-wait')}
      >
        {retrying ? 'Tentando novamente…' : 'Tentar novamente'}
      </Button>
    </section>
  )
}
