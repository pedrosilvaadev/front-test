import { LogOut } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { initials, useDocumentTitle, useSession, useSessionManager } from '../use-session'
import { AuthedPending } from './authed-states'

/**
 * Minimal protected profile (P3-01): data comes from the revalidated session
 * (`GET /api/auth/session`), nothing is invented. Editing, avatar, wallets
 * and favorites arrive with P3-02.
 */
export function ProfileSummary() {
  useDocumentTitle('Meu perfil')
  const session = useSession()
  const manager = useSessionManager()
  const [signingOut, setSigningOut] = useState(false)

  if (session.status !== 'authenticated') return <AuthedPending />
  const { user } = session

  return (
    <section
      aria-labelledby="profile-title"
      data-testid="profile-summary"
      className="mx-auto flex w-full max-w-xl flex-col gap-6 rounded-card bg-card p-6 md:p-10"
    >
      <h1 id="profile-title" className="text-2xl font-bold tracking-[0.04em]">
        Meu perfil
      </h1>
      <div className="flex items-center gap-4">
        <span
          aria-hidden="true"
          className="flex size-16 shrink-0 items-center justify-center rounded-full bg-primary text-xl font-bold text-primary-foreground"
        >
          {initials(user.displayName)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-lg font-bold" data-testid="profile-display-name">
            {user.displayName}
          </p>
          <p className="truncate text-muted-foreground">@{user.username}</p>
        </div>
      </div>
      <dl className="grid gap-4 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-6">
        <dt className="text-muted-foreground">Nome de exibição</dt>
        <dd className="break-words">{user.displayName}</dd>
        <dt className="text-muted-foreground">Nome de usuário</dt>
        <dd className="break-words" data-testid="profile-username">
          {user.username}
        </dd>
        <dt className="text-muted-foreground">E-mail</dt>
        <dd className="break-words" data-testid="profile-email">
          {user.email}
        </dd>
      </dl>
      <Button
        type="button"
        variant="outline"
        className="self-start rounded-sm font-bold"
        disabled={signingOut}
        onClick={() => {
          setSigningOut(true)
          void manager.signOut()
        }}
      >
        <LogOut className="size-4" aria-hidden="true" />
        Sair
      </Button>
    </section>
  )
}
