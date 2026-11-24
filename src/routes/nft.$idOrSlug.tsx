import { createFileRoute } from '@tanstack/react-router'
import { NftDetailPage } from '@/features/nft-detail/components/nft-detail-page'

/**
 * NFT detail (`/nft/emerald-ape-042` or `/nft/nft_001`). The loader starts
 * both requests (also on link hover/focus via `defaultPreload: 'intent'`)
 * without awaiting them, so the page renders its skeleton, 404 or error
 * state itself from the query (no router error boundary for an unknown
 * NFT); `prefetchQuery` never throws.
 *
 * The loader stays in the main bundle (autoCodeSplitting only splits the
 * component), so the query module (Axios client, API layer) is imported
 * dynamically here to keep it out of the entry chunk.
 */
export const Route = createFileRoute('/nft/$idOrSlug')({
  loader: async ({ context: { queryClient }, params: { idOrSlug } }) => {
    const { prefetchNftDetail } = await import('@/features/nft-detail/detail-queries')
    prefetchNftDetail(queryClient, idOrSlug)
  },
  component: NftDetailRoute,
})

function NftDetailRoute() {
  const { idOrSlug } = Route.useParams()
  return <NftDetailPage idOrSlug={idOrSlug} />
}
