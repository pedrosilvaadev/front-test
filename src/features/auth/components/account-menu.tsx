import { Link } from '@tanstack/react-router'
import { LogOut, User as UserIcon } from 'lucide-react'
import type { User } from '@/contracts'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { initials, useSessionManager } from '../use-session'
import { AccountButtonContent, accountButtonClass } from './account-button'

/**
 * Signed-in header menu (Perfil, Sair). Loaded lazily by `HeaderAccount` so
 * the Radix menu/popper code stays out of the entry chunk for guests.
 */
export default function AccountMenu({ user }: { user: User }) {
  const manager = useSessionManager()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={`Conta de ${user.displayName}`} className={accountButtonClass}>
          <AccountButtonContent initials={initials(user.displayName)} displayName={user.displayName} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="truncate">@{user.username}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/perfil">
            <UserIcon aria-hidden="true" />
            Perfil
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void manager.signOut()}>
          <LogOut aria-hidden="true" />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
