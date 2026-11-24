import { ZoomIn } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import type { NftDetail } from '@/contracts'
import { cn } from '@/lib/utils'

interface NftGalleryProps {
  nft: NftDetail
  /** Mobile-only overlay controls (back / favorite) drawn over the art. */
  overlay?: ReactNode
}

/**
 * Detail gallery (Figma "Detalhes do NFT"): vertical thumbnails (md+) that
 * switch the main image (`aria-pressed`), the framed main image and a zoom
 * button opening a dialog with the large image (Radix: focus trap, Esc
 * closes, focus returns to the button). Alt text comes from the API.
 */
export function NftGallery({ nft, overlay }: NftGalleryProps) {
  const images = nft.gallery
  const [selected, setSelected] = useState(0)
  const current = images[selected] ?? nft.image

  return (
    <div className="flex gap-4 lg:gap-6" data-testid="nft-gallery">
      {images.length > 1 ? (
        <ul aria-label="Imagens do NFT" className="hidden w-16 shrink-0 flex-col gap-3 md:flex lg:w-[6.25rem] lg:gap-4">
          {images.map((image, index) => (
            <li key={`${image.url}-${String(index)}`}>
              <button
                type="button"
                aria-pressed={index === selected}
                aria-label={`Mostrar imagem ${String(index + 1)} de ${String(images.length)}`}
                onClick={() => setSelected(index)}
                className={cn(
                  'block overflow-hidden rounded-sm border-2 border-transparent outline-none transition-colors',
                  'hover:border-border-accent focus-visible:ring-2 focus-visible:ring-ring',
                  'aria-pressed:border-primary',
                )}
              >
                <img
                  src={image.url}
                  alt=""
                  width={image.width}
                  height={image.height}
                  loading="lazy"
                  decoding="async"
                  className="aspect-square w-full object-cover"
                />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="relative min-w-0 flex-1 md:self-start md:rounded-sm md:bg-card md:p-4 lg:p-5">
        <img
          src={current.url}
          alt={current.alt}
          width={current.width}
          height={current.height}
          fetchPriority="high"
          decoding="async"
          data-testid="nft-main-image"
          className="aspect-square w-full rounded-[1.5rem] object-cover md:rounded-card"
        />
        {overlay}
        <Dialog>
          <DialogTrigger asChild>
            <button
              type="button"
              aria-label="Ampliar imagem"
              className={cn(
                'absolute top-1 right-1 hidden size-10 items-center justify-center rounded-full bg-background/85 text-foreground outline-none md:flex',
                'hover:text-brand focus-visible:ring-2 focus-visible:ring-ring',
              )}
            >
              <ZoomIn className="size-6" aria-hidden="true" />
            </button>
          </DialogTrigger>
          <DialogContent className="max-w-[min(90vw,48rem)] p-3 md:p-4">
            <DialogTitle className="pr-10">{nft.name}</DialogTitle>
            <DialogDescription className="sr-only">Imagem ampliada. Pressione Esc para fechar.</DialogDescription>
            <img
              src={current.url}
              alt={current.alt}
              width={current.width}
              height={current.height}
              decoding="async"
              className="max-h-[75vh] w-full rounded-card object-contain"
              data-testid="nft-zoom-image"
            />
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
