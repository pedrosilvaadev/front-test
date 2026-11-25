import { Link } from '@tanstack/react-router'
import { AuthedPending } from '@/features/auth/components/authed-states'
import { useDocumentTitle } from '@/features/auth/use-session'
import { NftCard } from '@/features/catalog/components/nft-card'
import { primaryButtonClass } from '@/features/profile/account-styles'
import { AccountShell } from '@/features/profile/components/account-shell'
import { AccountError, AccountLoading } from '@/features/profile/components/account-states'
import { useFavoritesList } from '../favorites-queries'

/**
 * "Lista de interesse" (`/favoritos`, P3-02): the signed-in user's favorites,
 * newest first, inside the account menu of the Figma profile frames. Hearts
 * remove optimistically (with rollback) like everywhere else.
 */
export function FavoritesPage() {
  useDocumentTitle('Lista de interesse')
  const { session, query } = useFavoritesList()
  if (session !== 'authenticated') return <AuthedPending />
  return (
    <AccountShell section="favorites" testId="favorites-page">
      <section aria-labelledby="favorites-title" className="flex min-w-0 flex-col gap-6">
        <h1 id="favorites-title" className="text-base font-bold tracking-[0.04em] text-foreground md:text-lg">
          Lista de interesse
        </h1>
        {query.data ? (
          query.data.items.length === 0 ? (
            <div data-testid="favorites-empty" className="flex flex-col items-start gap-4 rounded-sm bg-card p-6">
              <p className="text-sm text-foreground">Você ainda não favoritou nenhum NFT.</p>
              <Link to="/" className={primaryButtonClass}>
                Explorar NFTs
              </Link>
            </div>
          ) : (
            <ul aria-label="Favoritos" className="grid grid-cols-2 gap-x-4 gap-y-8 lg:grid-cols-3">
              {query.data.items.map((item) => (
                <li key={item.nftId} className="min-w-0">
                  <NftCard nft={item.nft} />
                </li>
              ))}
            </ul>
          )
        ) : query.isError ? (
          <AccountError onRetry={() => void query.refetch()} retrying={query.isFetching} />
        ) : (
          <AccountLoading label="Carregando favoritos…" />
        )}
      </section>
    </AccountShell>
  )
}
