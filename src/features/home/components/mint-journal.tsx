import { ArrowRight } from 'lucide-react'
import { UnavailableLink } from '@/components/layout/unavailable-link'
import { JOURNAL_ARTICLES, JOURNAL_COPY } from '../content'

/**
 * "Diário da Cunhagem" editorial block (Figma "Início"). Static editorial
 * copy; article pages are not part of this release, so "Ler mais" uses the
 * shared unavailable-link pattern (focusable, announced, never navigates).
 * Horizontal snap scroll on phones, 2 columns on tablets, 4 on desktop.
 */
export function MintJournal() {
  return (
    <section aria-labelledby="journal-title" data-testid="mint-journal" className="flex flex-col gap-6 md:gap-8">
      <header className="flex flex-col gap-2 text-center">
        <h2 id="journal-title" className="text-xl font-bold tracking-[0.04em] text-foreground md:text-[1.75rem]">
          {JOURNAL_COPY.title}
        </h2>
        <p className="text-xs leading-relaxed text-muted-foreground md:text-sm">{JOURNAL_COPY.subtitle}</p>
      </header>
      {/* Phones: horizontal snap carousel inside the content width (no page overflow). */}
      <ul
        aria-label="Artigos"
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 sm:grid sm:snap-none sm:grid-cols-2 sm:overflow-visible sm:pb-0 lg:grid-cols-4 lg:gap-6"
      >
        {JOURNAL_ARTICLES.map((article) => (
          <li key={article.id} className="w-[78%] min-w-0 shrink-0 snap-start sm:w-auto">
            <article className="relative flex h-full flex-col overflow-hidden rounded-sm bg-card">
              <img
                src={article.image}
                alt=""
                width={268}
                height={192}
                loading="lazy"
                decoding="async"
                className="aspect-[268/192] w-full object-cover object-top"
              />
              <div className="flex flex-1 flex-col gap-2 px-4 pt-3 pb-4">
                <p className="text-[0.6875rem] tracking-[0.02em] text-subtle-foreground">
                  {article.date}
                  <span aria-hidden="true" className="px-2">
                    |
                  </span>
                  <span className="sr-only">, </span>
                  {article.readingTime}
                </p>
                <h3 className="text-sm leading-snug font-bold tracking-[0.02em] text-foreground">{article.title}</h3>
                <p className="flex-1 text-xs leading-relaxed text-muted-foreground">{article.excerpt}</p>
                <UnavailableLink className="mt-1 inline-flex w-fit items-center gap-1 rounded-sm text-xs font-bold text-brand outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {JOURNAL_COPY.readMore}
                  <span className="sr-only"> {article.title}</span>
                  <ArrowRight className="size-3.5" aria-hidden="true" />
                </UnavailableLink>
              </div>
            </article>
          </li>
        ))}
      </ul>
    </section>
  )
}
