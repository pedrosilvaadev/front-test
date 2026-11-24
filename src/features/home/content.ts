import type { CatalogSearch } from '../catalog/catalog-search'

/**
 * Static marketing/editorial copy for the home (Figma "Início"). These are
 * not NFT listings: every NFT shown on the page comes from the API. The
 * images are the brand artwork shipped in `public/nfts/` and are decorative
 * here (`alt=""`): the text next to them carries the meaning.
 */

/** Anchor of the catalog block (EXPLORAR and promo links scroll to it). */
export const CATALOG_ANCHOR_ID = 'catalogo'

export const HERO_COPY = {
  eyebrow: 'Bem-vindo à Kurio',
  titleDesktop: 'SEJA DONO DO FUTURO DA ARTE DIGITAL',
  titleMobile: 'SEJA DONO DA CULTURA DIGITAL',
  descriptionDesktop:
    'Descubra NFTs selecionados de criadores emergentes e consagrados. Colecione arte digital rara, apoie artistas e tenha uma parte da cultura da internet.',
  descriptionMobile: 'Descubra NFTs selecionados de criadores do mundo todo.',
  cta: 'EXPLORAR',
} as const

export interface PromoBanner {
  id: string
  title: string
  description: string
  image: string
  /** Catalog URL state the banner opens (contract ids, flat strings per ADR-007). */
  search: CatalogSearch
}

export const PROMO_BANNERS: readonly PromoBanner[] = [
  {
    id: 'genesis',
    title: 'Lançamentos gênesis de edição limitada',
    description: 'Colecione edições escassas diretamente dos criadores antes da revelação pública.',
    image: '/nfts/emerald-ape.webp',
    search: { tab: 'new' },
  },
  {
    id: 'digital-art',
    title: 'Arte digital selecionada e muito mais',
    description: 'Explore novos artistas, coleções verificadas e obras digitais que definem a cultura.',
    image: '/nfts/ivory-baron.webp',
    search: { categories: 'digital-art' },
  },
]

export interface JournalArticle {
  id: string
  date: string
  readingTime: string
  title: string
  excerpt: string
  image: string
}

export const JOURNAL_COPY = {
  title: 'Diário da Cunhagem',
  subtitle: 'Histórias, guias e insights para colecionadores sobre o universo da propriedade digital.',
  readMore: 'Ler mais',
} as const

export const JOURNAL_ARTICLES: readonly JournalArticle[] = [
  {
    id: 'ownership',
    date: '12 de setembro',
    readingTime: 'Leitura de 6 min',
    title: 'Como funciona a propriedade de NFTs',
    excerpt: 'Aprenda a colecionar, negociar e verificar ativos digitais.',
    image: '/nfts/ivory-baron.webp',
  },
  {
    id: 'artists',
    date: '13 de setembro',
    readingTime: 'Leitura de 2 min',
    title: '10 artistas digitais para acompanhar',
    excerpt: 'Conheça criadores que moldam a cultura digital.',
    image: '/nfts/emerald-ape.webp',
  },
  {
    id: 'rarity',
    date: '15 de setembro',
    readingTime: 'Leitura de 3 min',
    title: 'Raridade, atributos e procedência',
    excerpt: 'Entenda raridade, procedência, direitos autorais e utilidade.',
    image: '/nfts/sage-nomad.webp',
  },
  {
    id: 'wallet',
    date: '15 de setembro',
    readingTime: 'Leitura de 2 min',
    title: 'Como proteger sua carteira',
    excerpt: 'Proteja sua carteira, seus ativos e sua identidade.',
    image: '/nfts/golden-beat.webp',
  },
]
