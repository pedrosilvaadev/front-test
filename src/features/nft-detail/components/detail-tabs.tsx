import type * as React from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { NftDetail } from '@/contracts'
import { NETWORK_LABELS } from '../../catalog/labels'
import { reviewsLabel, shortenAddress } from '../format'

const paragraphClass = 'text-[0.8125rem] leading-[1.75] tracking-[0.02em] text-muted-foreground'

function Fact({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-[0.8125rem] font-bold tracking-[0.04em] text-foreground">{title}:</dt>
      <dd className={paragraphClass}>{children}</dd>
    </div>
  )
}

/**
 * "Detalhes do NFT" / "Avaliações de colecionadores (N)" (Radix tabs:
 * arrow keys, automatic activation). Details come from the API (`details`,
 * `network`, `contract`, `creator.royaltyPercent`). There is no reviews
 * endpoint in the contract, so the reviews tab only states the API rating
 * summary and that the list is coming soon (no invented reviews).
 */
export function DetailTabs({ nft }: { nft: NftDetail }) {
  const network = NETWORK_LABELS[nft.network]
  return (
    <Tabs defaultValue="details" className="gap-5" data-testid="nft-detail-tabs">
      <TabsList aria-label="Informações do NFT" className="gap-6 overflow-x-auto md:gap-9">
        <TabsTrigger value="details" className="shrink-0">
          Detalhes do NFT
        </TabsTrigger>
        <TabsTrigger value="reviews" className="shrink-0">
          Avaliações de colecionadores ({nft.rating.count})
        </TabsTrigger>
      </TabsList>
      <TabsContent value="details" className="flex flex-col gap-5">
        {nft.details.map((paragraph, index) => (
          <p key={index} className={paragraphClass}>
            {paragraph}
          </p>
        ))}
        <dl className="flex flex-col gap-4">
          <Fact title="Rede">
            Cunhado na {network} com procedência imutável e metadados armazenados no {nft.contract.metadataStorage}.
          </Fact>
          <Fact title="Contrato">
            <span title={nft.contract.address}>{shortenAddress(nft.contract.address)}</span> · Contrato inteligente{' '}
            {nft.contract.standard} verificado.
          </Fact>
          <Fact title="Direitos autorais">
            Direitos autorais do criador ({nft.creator.name}): {nft.creator.royaltyPercent}% nas vendas secundárias.
          </Fact>
        </dl>
      </TabsContent>
      <TabsContent value="reviews" className="flex flex-col gap-2">
        <p className={paragraphClass}>
          Nota média {nft.rating.average} de 5, com base em {reviewsLabel(nft.rating.count)}.
        </p>
        <p className={paragraphClass}>A lista de avaliações estará disponível em breve.</p>
      </TabsContent>
    </Tabs>
  )
}
