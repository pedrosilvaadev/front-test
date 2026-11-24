import { useId } from 'react'
import { cn } from '@/lib/utils'
import { PlannedRouteLink } from './planned-route-link'
import { PLANNED_ROUTES, UNAVAILABLE_SUFFIX } from './planned-routes'
import { FacebookIcon, InstagramIcon, LinkedinIcon, TwitterIcon, YoutubeIcon } from './social-icons'
import { UnavailableLink } from './unavailable-link'

const FEATURES = [
  {
    letter: 'W',
    title: 'Segurança da carteira',
    text: 'Proteja sua carteira e colecione arte digital verificada com confiança.',
  },
  {
    letter: 'C',
    title: 'Criadores em destaque',
    text: 'Conheça artistas, estúdios e comunidades que moldam a cultura digital na rede.',
  },
  {
    letter: 'D',
    title: 'Alertas de lançamentos',
    text: 'Receba calendários de cunhagem, novidades de listas de acesso e análises do mercado.',
  },
] as const

type FooterLink = { label: string; to?: (typeof PLANNED_ROUTES)[keyof typeof PLANNED_ROUTES] }

const LINK_COLUMNS: ReadonlyArray<{ title: string; links: readonly FooterLink[] }> = [
  {
    title: 'Meu perfil',
    links: [
      { label: 'Meu perfil', to: PLANNED_ROUTES.profile },
      { label: 'Minha coleção' },
      { label: 'Atividade' },
      { label: 'Estúdio do criador' },
      { label: 'Lista de interesse', to: PLANNED_ROUTES.favorites },
    ],
  },
  {
    title: 'Central de ajuda',
    links: [
      { label: 'Central de ajuda' },
      { label: 'Como comprar NFTs' },
      { label: 'Carteira e segurança' },
      { label: 'Política do mercado' },
      { label: 'Denunciar item' },
    ],
  },
  {
    title: 'Coleções',
    links: [
      { label: 'Arte digital' },
      { label: 'Fotografia' },
      { label: 'Música' },
      { label: 'Arte 3D' },
      { label: 'Utilidade' },
    ],
  },
]

const SOCIALS = [
  { label: 'Facebook', Icon: FacebookIcon },
  { label: 'Instagram', Icon: InstagramIcon },
  { label: 'Twitter', Icon: TwitterIcon },
  { label: 'LinkedIn', Icon: LinkedinIcon },
  { label: 'YouTube', Icon: YoutubeIcon },
] as const

const linkClass =
  'rounded-sm text-sm text-foreground outline-none hover:text-brand focus-visible:ring-2 focus-visible:ring-ring'

const headingClass = 'text-lg font-bold text-foreground'

export function SiteFooter() {
  return (
    <footer className="mt-16 md:mt-24">
      <div className="mx-auto w-full max-w-[75rem] bg-card">
        <FeatureRow />
        <ContactBand />
        <LinkColumns />
      </div>
      <p className="px-6 py-4 text-center text-sm text-foreground">
        <span aria-hidden="true">©</span>
        <span className="sr-only">Copyright</span> 2026 Kurio. Propriedade digital para todos.
      </p>
    </footer>
  )
}

function FeatureRow() {
  return (
    <div className="grid gap-8 px-6 py-8 sm:grid-cols-2 md:px-12 lg:grid-cols-[15.5625rem_16.625rem_16.625rem_minmax(0,1fr)] lg:gap-0 lg:pr-[1.875rem]">
      {FEATURES.map((feature, index) => (
        <section
          key={feature.letter}
          aria-labelledby={`footer-feature-${feature.letter}`}
          className={cn('flex flex-col gap-3', index > 0 && 'lg:border-l lg:border-border-accent lg:pl-4')}
        >
          <span
            aria-hidden="true"
            className="flex size-[4.625rem] items-center justify-center rounded-full bg-primary text-2xl font-bold text-primary-foreground"
          >
            {feature.letter}
          </span>
          <h2 id={`footer-feature-${feature.letter}`} className="text-base font-bold tracking-[0.04em] text-foreground">
            {feature.title}
          </h2>
          <p className="text-sm leading-[1.6] text-muted-foreground lg:max-w-[13rem]">{feature.text}</p>
        </section>
      ))}
      <NewsletterForm />
    </div>
  )
}

/**
 * Newsletter sign-up has no API contract in this release, so the submit
 * control is unavailable and the form never reports a fake success.
 */
function NewsletterForm() {
  const headingId = useId()
  const emailId = useId()
  const hintId = useId()
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4 lg:border-l lg:border-border-accent lg:pl-4">
      <h2 id={headingId} className="text-lg leading-[1.1] font-bold text-foreground">
        Antecipe-se ao próximo lançamento
      </h2>
      <form className="flex" onSubmit={(event) => event.preventDefault()} aria-describedby={hintId}>
        <label htmlFor={emailId} className="sr-only">
          E-mail
        </label>
        <input
          id={emailId}
          type="email"
          name="email"
          autoComplete="email"
          placeholder="digite seu e-mail..."
          className="h-10 min-w-0 flex-1 rounded-l-sm bg-secondary px-3 text-sm text-foreground outline-none placeholder:text-subtle-foreground focus-visible:ring-2 focus-visible:ring-ring"
        />
        <button
          type="submit"
          aria-disabled="true"
          aria-describedby={hintId}
          className="h-10 cursor-not-allowed rounded-r-sm bg-primary px-4 text-lg font-bold text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
        >
          Enviar
        </button>
      </form>
      <p className="text-[0.8125rem] leading-[1.7] text-muted-foreground">
        Receba lançamentos selecionados, histórias de criadores e novidades do mercado.
      </p>
      <p id={hintId} className="sr-only">
        Inscrição na newsletter disponível em breve.
      </p>
    </section>
  )
}

function ContactBand() {
  return (
    <div className="grid gap-4 bg-secondary px-6 py-6 text-sm text-foreground sm:grid-cols-2 md:px-8 lg:min-h-[5.5rem] lg:grid-cols-[repeat(3,minmax(0,1fr))_14.25rem] lg:items-center lg:gap-0 lg:py-0">
      <p className="font-bold tracking-[0.12em]">KURIO</p>
      <p className="leading-[1.6] lg:max-w-[14rem]">Feito para colecionadores, criadores e cultura</p>
      <p>contato@email.com</p>
      <p>+55 11 4002 8922</p>
    </div>
  )
}

function LinkColumns() {
  return (
    <div className="grid gap-8 px-6 pt-8 pb-10 sm:grid-cols-2 md:px-8 lg:grid-cols-[repeat(3,minmax(0,1fr))_14.25rem] lg:gap-x-0">
      {LINK_COLUMNS.map((column) => (
        <nav key={column.title} aria-label={column.title}>
          <h2 className={headingClass}>{column.title}</h2>
          <ul className="mt-2 flex flex-col gap-2.5 text-sm">
            {column.links.map((link) => (
              <li key={link.label}>
                {link.to ? (
                  <PlannedRouteLink to={link.to} className={linkClass}>
                    {link.label}
                  </PlannedRouteLink>
                ) : (
                  <UnavailableLink className={linkClass}>{link.label}</UnavailableLink>
                )}
              </li>
            ))}
          </ul>
        </nav>
      ))}
      <div className="flex flex-col gap-6">
        <section aria-labelledby="footer-socials">
          <h2 id="footer-socials" className={headingClass}>
            Redes sociais
          </h2>
          <ul className="mt-3 flex gap-2">
            {SOCIALS.map(({ label, Icon }) => (
              <li key={label}>
                <UnavailableLink
                  aria-label={`${label} ${UNAVAILABLE_SUFFIX}`}
                  className="flex size-8 items-center justify-center rounded-sm border border-primary text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Icon />
                </UnavailableLink>
              </li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="footer-wallets">
          <h2 id="footer-wallets" className={headingClass}>
            Carteiras compatíveis
          </h2>
          <p className="mt-2 inline-flex flex-wrap items-center gap-x-2 whitespace-nowrap rounded-sm border border-border-accent/60 bg-secondary px-2.5 py-1 text-[0.5625rem] font-bold text-brand uppercase">
            <span>MetaMask</span>
            <span aria-hidden="true">•</span>
            <span>WalletConnect</span>
            <span aria-hidden="true">•</span>
            <span>Coinbase</span>
          </p>
        </section>
      </div>
    </div>
  )
}
