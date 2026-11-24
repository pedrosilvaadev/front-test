import { AlertTriangle, SearchX } from 'lucide-react'
import { isApiError } from '@/api/errors'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { gridClass } from './grid-class'

/** Placeholder cards with the same footprint as `NftCard` (no layout shift when data arrives). */
export function CatalogGridSkeleton({ count }: { count: number }) {
  return (
    <ul aria-hidden="true" className={gridClass} data-testid="catalog-skeleton">
      {Array.from({ length: count }, (_, index) => (
        <li key={index} className="flex flex-col">
          <Skeleton className="aspect-square w-full rounded-2xl bg-card md:aspect-[258/300] md:rounded-sm" />
          <Skeleton className="mt-4 h-4 w-3/4 bg-card" />
          <Skeleton className="mt-2 h-4 w-1/3 bg-card" />
        </li>
      ))}
    </ul>
  )
}

interface EmptyStateProps {
  /** A page past the end was requested (`?page=99`). */
  pastLastPage: boolean
  canClearFilters: boolean
  onClearFilters: () => void
  onFirstPage: () => void
}

export function CatalogEmptyState({ pastLastPage, canClearFilters, onClearFilters, onFirstPage }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-sm bg-card px-6 py-12 text-center">
      <SearchX className="size-10 text-brand" aria-hidden="true" />
      <h3 className="text-lg font-bold tracking-[0.04em]">
        {pastLastPage ? 'Esta página não existe' : 'Nenhum NFT encontrado'}
      </h3>
      <p className="max-w-sm text-sm text-muted-foreground">
        {pastLastPage
          ? 'Não há resultados nesta página. Volte para a primeira página.'
          : 'Nenhum item corresponde aos filtros selecionados. Ajuste ou limpe os filtros para ver mais NFTs.'}
      </p>
      {pastLastPage ? (
        <Button type="button" onClick={onFirstPage} className="rounded-sm font-bold">
          Ir para a primeira página
        </Button>
      ) : canClearFilters ? (
        <Button type="button" onClick={onClearFilters} className="rounded-sm font-bold">
          Limpar filtros
        </Button>
      ) : null}
    </div>
  )
}

function errorMessage(error: unknown): string {
  if (isApiError(error)) {
    if (error.kind === 'network') return 'Sem conexão com o servidor. Verifique sua internet e tente novamente.'
    if (error.kind === 'timeout') return 'O servidor demorou demais para responder. Tente novamente.'
    if (error.kind === 'transient') return 'O serviço está temporariamente indisponível. Tente novamente.'
  }
  return 'Ocorreu um erro inesperado ao carregar o catálogo.'
}

interface ErrorStateProps {
  error: unknown
  onRetry: () => void
  retrying: boolean
}

export function CatalogErrorState({ error, onRetry, retrying }: ErrorStateProps) {
  return (
    <div role="alert" className="flex flex-col items-center gap-4 rounded-sm bg-card px-6 py-12 text-center">
      <AlertTriangle className="size-10 text-destructive" aria-hidden="true" />
      <h3 className="text-lg font-bold tracking-[0.04em]">Não foi possível carregar os NFTs</h3>
      <p className="max-w-sm text-sm text-muted-foreground">{errorMessage(error)}</p>
      <Button
        type="button"
        onClick={onRetry}
        disabled={retrying}
        className={cn('rounded-sm font-bold', retrying && 'cursor-wait')}
      >
        {retrying ? 'Tentando novamente…' : 'Tentar novamente'}
      </Button>
    </div>
  )
}
