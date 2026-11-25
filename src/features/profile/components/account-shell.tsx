import { Link } from '@tanstack/react-router'
import { Download, Heart, LogOut, MapPin, ShoppingCart, TrendingUp, TriangleAlert, User, type LucideIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { UnavailableLink } from '@/components/layout/unavailable-link'
import { useSessionManager } from '@/features/auth/use-session'
import { cn } from '@/lib/utils'

type Section = 'profile' | 'wallets' | 'favorites'

const itemClass = cn(
  'relative flex shrink-0 items-center gap-3 rounded-sm px-4 py-2.5 text-[0.9375rem] tracking-[0.04em] whitespace-nowrap text-brand/90 outline-none',
  'hover:text-brand focus-visible:ring-2 focus-visible:ring-ring md:rounded-none md:py-3',
  'aria-[current=page]:bg-primary/10 aria-[current=page]:text-brand md:aria-[current=page]:bg-transparent',
  'md:aria-[current=page]:before:absolute md:aria-[current=page]:before:inset-y-0 md:aria-[current=page]:before:left-0 md:aria-[current=page]:before:w-1.5 md:aria-[current=page]:before:bg-primary',
)

const LINKS: ReadonlyArray<{ section: Section; to: '/perfil' | '/carteiras' | '/favoritos'; label: string; Icon: LucideIcon }> = [
  { section: 'profile', to: '/perfil', label: 'Dados do perfil', Icon: User },
  { section: 'wallets', to: '/carteiras', label: 'Carteiras', Icon: MapPin },
]

const UNAVAILABLE_BEFORE: ReadonlyArray<{ label: string; Icon: LucideIcon }> = [{ label: 'Atividade', Icon: ShoppingCart }]
const UNAVAILABLE_AFTER: ReadonlyArray<{ label: string; Icon: LucideIcon }> = [
  { label: 'Ofertas', Icon: TrendingUp },
  { label: 'Arquivos baixados', Icon: Download },
  { label: 'Suporte', Icon: TriangleAlert },
]

/**
 * "Meu perfil" side menu from the Figma account frames (Perfil do
 * colecionador / Carteiras). Sections outside this release (Atividade,
 * Ofertas, Arquivos baixados, Suporte) use the unavailable-link pattern.
 * Below `md` the menu becomes one horizontally scrollable row (no Figma
 * mobile frame exists for these screens); the page never overflows.
 */
export function AccountShell({ section, children, testId }: { section: Section; children: ReactNode; testId?: string }) {
  const manager = useSessionManager()
  const [signingOut, setSigningOut] = useState(false)
  const current = (value: Section) => (value === section ? 'page' : undefined)
  return (
    <div data-testid={testId} className="mx-auto grid w-full min-w-0 gap-6 md:grid-cols-[minmax(0,19.375rem)_minmax(0,1fr)] md:gap-7">
      <aside className="flex min-w-0 items-center self-start overflow-x-auto rounded-sm bg-card py-1 md:block md:overflow-visible md:py-3 md:pb-0">
        <p aria-hidden="true" className="hidden px-3 pb-2 text-lg font-bold tracking-[0.04em] text-foreground md:block md:pt-1">
          Meu perfil
        </p>
        <nav aria-label="Menu da conta">
          <ul className="flex gap-1 px-1 md:flex-col md:gap-0 md:px-0">
            {LINKS.map(({ section: value, to, label, Icon }) => (
              <li key={to}>
                <Link to={to} aria-current={current(value)} className={itemClass}>
                  <Icon className="size-4" aria-hidden="true" />
                  {label}
                </Link>
              </li>
            ))}
            {UNAVAILABLE_BEFORE.map(({ label, Icon }) => (
              <li key={label}>
                <UnavailableLink className={itemClass}>
                  <Icon className="size-4" aria-hidden="true" />
                  {label}
                </UnavailableLink>
              </li>
            ))}
            <li>
              <Link to="/favoritos" aria-current={current('favorites')} className={itemClass}>
                <Heart className="size-4" aria-hidden="true" />
                Lista de interesse
              </Link>
            </li>
            {UNAVAILABLE_AFTER.map(({ label, Icon }) => (
              <li key={label}>
                <UnavailableLink className={itemClass}>
                  <Icon className="size-4" aria-hidden="true" />
                  {label}
                </UnavailableLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="shrink-0 border-l border-border px-1 md:mt-2 md:border-t md:border-l-0 md:px-0 md:pt-2 md:pb-2">
          <button
            type="button"
            disabled={signingOut}
            onClick={() => {
              setSigningOut(true)
              void manager.signOut()
            }}
            className={cn(itemClass, 'w-full font-bold text-brand disabled:opacity-60')}
          >
            <LogOut className="size-4" aria-hidden="true" />
            Sair
          </button>
        </div>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  )
}
