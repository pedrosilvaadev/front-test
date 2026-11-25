import { useQuery } from '@tanstack/react-query'
import { Link, useCanGoBack, useNavigate, useRouter } from '@tanstack/react-router'
import { ChevronLeft, Mail, ShoppingCart, Star } from 'lucide-react'
import { useEffect } from 'react'
import { LinkedinIcon, TwitterIcon } from '@/components/layout/social-icons'
import type { NftDetail } from '@/contracts'
import { usePurchaseActions, type PurchaseActions } from '@/features/cart/use-purchase-actions'
import { FavoriteButton } from '@/features/favorites/components/favorite-button'
import { formatEth, mulEth } from '@/lib/money'
import { cn } from '@/lib/utils'
import { detailFailure, nftDetailQueryOptions } from '../detail-queries'
import { reviewsLabel } from '../format'
import { usePurchaseSelection, type PurchaseSelection } from '../purchase-selection'
import { DetailTabs } from './detail-tabs'
import { NftDetailError, NftDetailSkeleton, NftNotFound } from './detail-states'
import { EditionPicker } from './edition-picker'
import { NftGallery } from './nft-gallery'
import { PurchaseFeedback } from './purchase-actions'
import { QuantityStepper } from './quantity-stepper'
import { RatingStars } from './rating-stars'
import { RelatedNfts } from './related-nfts'

const APP_NAME = 'Kurio'

/** Sets `document.title` while mounted and restores the previous title afterwards. */
function useDocumentTitle(title: string | undefined) {
  useEffect(() => {
    if (!title) return
    const previous = document.title
    document.title = `${title} | ${APP_NAME}`
    return () => {
      document.title = previous
    }
  }, [title])
}

/**
 * NFT detail route (`/nft/$idOrSlug`, README §3 "Catálogo e detalhe", Figma
 * "Detalhes do NFT"). States: shimmer skeleton while pending, "NFT não
 * encontrado" for API 404 `NFT_NOT_FOUND`, retryable error otherwise. Data
 * already on screen stays visible if a background refetch fails.
 */
export function NftDetailPage({ idOrSlug }: { idOrSlug: string }) {
  const detail = useQuery(nftDetailQueryOptions(idOrSlug))
  const failure = !detail.data && detail.isError ? detailFailure(detail.error) : undefined
  useDocumentTitle(detail.data?.name ?? (failure === 'not-found' ? 'NFT não encontrado' : undefined))

  if (detail.data) return <NftDetailContent key={detail.data.id} nft={detail.data} idOrSlug={idOrSlug} />
  if (failure === 'not-found') return <NftNotFound idOrSlug={idOrSlug} />
  if (failure === 'error') {
    return (
      <NftDetailError error={detail.error} onRetry={() => void detail.refetch()} retrying={detail.isFetching} />
    )
  }
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Carregando NFT…</span>
      <NftDetailSkeleton />
    </div>
  )
}

function Breadcrumb() {
  return (
    <nav aria-label="Trilha de navegação" className="hidden md:block">
      <ol className="flex items-center gap-1.5 text-sm font-bold tracking-[0.04em] text-foreground">
        <li>
          <Link to="/" className="rounded-sm outline-none hover:text-brand focus-visible:ring-2 focus-visible:ring-ring">
            Início
          </Link>
        </li>
        <li aria-hidden="true">/</li>
        <li>Mercado</li>
      </ol>
    </nav>
  )
}

const roundIconClass =
  'inline-flex size-10 items-center justify-center rounded-full border border-border-accent bg-background/80 text-foreground outline-none hover:text-brand focus-visible:ring-2 focus-visible:ring-ring'

/** Mobile overlay on the art: back (history back, `/` when opened directly) and favorite heart (P3-02). */
function MobileTopActions({ nft }: { nft: NftDetail }) {
  const canGoBack = useCanGoBack()
  const router = useRouter()
  const navigate = useNavigate()
  return (
    <div className="pointer-events-none absolute inset-x-3 top-3 flex justify-between md:hidden">
      <button
        type="button"
        aria-label="Voltar"
        onClick={() => {
          if (canGoBack) router.history.back()
          else void navigate({ to: '/' })
        }}
        className={cn(roundIconClass, 'pointer-events-auto')}
      >
        <ChevronLeft className="size-5" aria-hidden="true" />
      </button>
      <FavoriteButton
        nft={nft}
        testId="nft-favorite-mobile"
        className={cn(roundIconClass, 'pointer-events-auto aria-pressed:text-brand')}
      />
    </div>
  )
}

function Price({ nft, className }: { nft: NftDetail; className?: string }) {
  return (
    <p className={cn('flex flex-wrap items-baseline gap-x-3 font-bold tracking-[0.04em] text-brand', className)}>
      <span data-testid="nft-price">
        <span className="sr-only">Preço: </span>
        {formatEth(nft.price)}
      </span>
      {nft.previousPrice ? (
        <s className="text-base font-normal text-subtle-foreground">
          <span className="sr-only">Preço anterior: </span>
          {formatEth(nft.previousPrice)}
        </s>
      ) : null}
    </p>
  )
}

function ShareLinks({ nft }: { nft: NftDetail }) {
  const url = `${window.location.origin}/nft/${encodeURIComponent(nft.slug)}`
  const text = `${nft.name} na ${APP_NAME}`
  const links = [
    {
      label: 'Compartilhar no LinkedIn',
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
      icon: <LinkedinIcon className="size-4" />,
    },
    {
      label: 'Compartilhar por e-mail',
      href: `mailto:?subject=${encodeURIComponent(text)}&body=${encodeURIComponent(url)}`,
      icon: <Mail className="size-4" aria-hidden="true" />,
    },
    {
      label: 'Compartilhar no Twitter',
      href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
      icon: <TwitterIcon className="size-4" />,
    },
  ]
  return (
    <div className="hidden items-center gap-3 md:flex">
      <p className="text-sm font-bold tracking-[0.04em] text-foreground">Compartilhar este NFT:</p>
      <ul className="flex items-center gap-2">
        {links.map((link) => (
          <li key={link.label}>
            <a
              href={link.href}
              target={link.href.startsWith('mailto:') ? undefined : '_blank'}
              rel="noopener noreferrer"
              aria-label={link.label}
              className="inline-flex size-6 items-center justify-center rounded-sm text-foreground outline-none hover:text-brand focus-visible:ring-2 focus-visible:ring-ring"
            >
              {link.icon}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}

const buyButtonDisabled = 'disabled:cursor-not-allowed disabled:opacity-50 aria-busy:opacity-70'

function DesktopPurchase({ nft, selection, actions }: { nft: NftDetail; selection: PurchaseSelection; actions: PurchaseActions }) {
  return (
    <div className="hidden flex-col gap-2 md:flex" data-testid="desktop-purchase">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <QuantityStepper selection={selection} />
        <div className="flex flex-wrap items-center gap-2">
          {/* P4-01: adds the selected edition × quantity and opens the cart. */}
          <button
            type="button"
            disabled={actions.disabled}
            aria-busy={actions.pending || undefined}
            onClick={() => actions.addSelected({ goToCart: true })}
            className={cn(
              'h-10 min-w-[7.25rem] rounded-sm bg-primary px-6 text-[0.8125rem] font-bold tracking-[0.04em] text-primary-foreground outline-none hover:bg-brand focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              buyButtonDisabled,
            )}
          >
            COMPRAR
          </button>
        <FavoriteButton
          nft={nft}
          testId="nft-favorite"
          visibleError
          className="inline-flex h-10 items-center gap-2 rounded-sm border border-primary px-3 text-[0.8125rem] tracking-[0.04em] text-brand outline-none hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring aria-pressed:bg-primary/15"
        >
          Favoritar
        </FavoriteButton>
        </div>
      </div>
      <PurchaseFeedback actions={actions} />
    </div>
  )
}

/**
 * Mobile sticky bar (Figma): Qtd stepper + subtotal (decimal `mulEth`),
 * "Comprar NFT" (add + open the cart) and cart icon (add, stay) (P4-01). It sits flush on top of the global tab bar
 * (same surface colour) and its bottom padding clears the raised scan button.
 */
function MobileBuyBar({ nft, selection, actions }: { nft: NftDetail; selection: PurchaseSelection; actions: PurchaseActions }) {
  const subtotal = mulEth(nft.price, selection.quantity)
  return (
    <div
      data-testid="mobile-buy-bar"
      className="sticky bottom-[calc(var(--tab-bar-height)+env(safe-area-inset-bottom)-1px)] z-30 -mx-6 flex flex-col gap-3 rounded-t-[2rem] bg-card px-6 pt-3 pb-10 shadow-[0_-8px_24px_rgb(0_0_0/0.35)] md:hidden"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="text-sm font-bold tracking-[0.04em] text-muted-foreground">
            Qtd.
          </span>
          <QuantityStepper selection={selection} size="sm" />
        </div>
        <p className="text-xl font-bold tracking-[0.04em] text-brand" data-testid="mobile-subtotal">
          <span className="sr-only">Subtotal: </span>
          {formatEth(subtotal)}
        </p>
      </div>
      <PurchaseFeedback actions={actions} />
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={actions.disabled}
          aria-busy={actions.pending || undefined}
          onClick={() => actions.addSelected({ goToCart: true })}
          className={cn(
            'h-12 flex-1 rounded-full bg-linear-to-r from-primary to-[#a66d3c] text-[0.9375rem] font-bold tracking-[0.04em] text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring',
            buyButtonDisabled,
          )}
        >
          Comprar NFT
        </button>
        <button
          type="button"
          aria-label="Adicionar ao carrinho"
          disabled={actions.disabled}
          aria-busy={actions.pending || undefined}
          onClick={() => actions.addSelected()}
          className={cn(
            'inline-flex size-12 shrink-0 items-center justify-center rounded-full border border-border-accent text-brand outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring',
            buyButtonDisabled,
          )}
        >
          <ShoppingCart className="size-5" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

/** `idOrSlug` is the route param, so related NFTs reuse the key the loader prefetched. */
function NftDetailContent({ nft, idOrSlug }: { nft: NftDetail; idOrSlug: string }) {
  const selection = usePurchaseSelection(nft.editions)
  const actions = usePurchaseActions(nft, selection)
  const reviews = reviewsLabel(nft.rating.count)

  return (
    <article aria-labelledby="nft-title" data-testid="nft-detail" className="flex flex-col gap-10 md:gap-16">
      <div className="flex flex-col gap-3">
        <Breadcrumb />
        <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-8 lg:grid-cols-[minmax(0,35.5rem)_minmax(0,1fr)] lg:gap-[1.875rem]">
          <NftGallery nft={nft} overlay={<MobileTopActions nft={nft} />} />

          <div className="relative z-10 -mx-6 -mt-8 flex min-w-0 flex-col gap-4 rounded-t-[2rem] bg-card px-6 pt-7 pb-4 md:mx-0 md:mt-0 md:gap-3.5 md:rounded-none md:bg-transparent md:p-0">
            <div className="flex items-start justify-between gap-3">
              <h1 id="nft-title" className="min-w-0 text-xl font-bold tracking-[0.04em] break-words text-foreground md:text-[1.75rem] md:leading-tight">
                {nft.name}
              </h1>
              <p className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border-accent px-2 py-0.5 text-sm font-bold text-foreground md:hidden">
                <Star className="size-4 fill-brand text-brand" aria-hidden="true" />
                <span aria-hidden="true">
                  {nft.rating.average}
                  <span className="font-normal text-muted-foreground">({nft.rating.count})</span>
                </span>
                <span className="sr-only">
                  Nota {nft.rating.average} de 5, {reviews}
                </span>
              </p>
            </div>

            <div className="hidden flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border pb-2 md:flex">
              <Price nft={nft} className="text-[1.375rem]" />
              <p className="flex items-center gap-1.5 text-[0.8125rem] tracking-[0.02em] text-foreground">
                <RatingStars average={nft.rating.average} />
                <span>{reviews}</span>
              </p>
            </div>

            <section aria-labelledby="nft-about" className="flex flex-col gap-2">
              <h2 id="nft-about" className="sr-only text-sm font-bold tracking-[0.04em] text-foreground md:not-sr-only">
                Sobre este NFT:
              </h2>
              <p className="text-[0.9375rem] leading-[1.75] tracking-[0.02em] text-muted-foreground md:text-[0.8125rem]">
                {nft.description}
              </p>
            </section>

            <EditionPicker editions={nft.editions} selection={selection} />
            <DesktopPurchase nft={nft} selection={selection} actions={actions} />

            <dl className="flex flex-col gap-2 text-[0.9375rem] tracking-[0.02em] text-subtle-foreground md:text-[0.8125rem]">
              <div>
                <dt className="inline">ID do token: </dt>
                <dd className="inline">{nft.tokenId}</dd>
              </div>
              <div>
                <dt className="inline">Coleção: </dt>
                <dd className="inline">{nft.collection.name}</dd>
              </div>
              <div>
                <dt className="inline">Atributos: </dt>
                <dd className="inline">{nft.attributes.join(', ')}</dd>
              </div>
            </dl>
            <ShareLinks nft={nft} />
          </div>
        </div>
      </div>

      <DetailTabs nft={nft} />
      <RelatedNfts idOrSlug={idOrSlug} />
      <MobileBuyBar nft={nft} selection={selection} actions={actions} />
    </article>
  )
}
