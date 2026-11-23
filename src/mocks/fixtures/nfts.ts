import { normalizeEth } from '@/lib/money'
import type { Category, Edition, Image, NftDetail } from '@/contracts'

/**
 * Deterministic NFT catalog seed (48 listings). Names, prices and characters
 * follow the Figma frames "Início" and "Detalhes do NFT" (Emerald Ape #042
 * 1.19 ETH, Sage Nomad #009 1.69 ETH, Neon Vessel #552 1.99 ETH was 2.29, ...).
 * No Math.random/Date.now: every value derives from the table below and a
 * fixed base timestamp, so the seed is identical on every build and reset.
 *
 * Images: stable public paths `/nfts/<art-key>.webp` (1024x1024). The files
 * are produced later by the UI slice (P2); until then the URLs 404 and the UI
 * must reserve space using width/height. The Figma detail gallery shows four
 * identical thumbnails, so each gallery repeats the main art (distinct alt).
 *
 * Sidebar counts in the Figma (e.g. "Arte digital (33)", "Ethereum (119)")
 * are illustrative; facets are computed from this seed instead.
 */

export const ART = {
  /** Brown ape, round sunglasses, green varsity jacket (hero, Emerald Ape). */
  'emerald-ape': { alt: 'Macaco marrom com óculos escuros redondos e jaqueta college verde' },
  /** Gray ape, green bucket hat, purple hoodie (Sage Nomad, "NFT em destaque"). */
  'sage-nomad': { alt: 'Macaco cinza com chapéu bucket verde e moletom roxo' },
  /** Black ape, dark green turtleneck, beige blazer (Neon Vessel, Ivory Baron). */
  'ivory-baron': { alt: 'Macaco preto com gola alta verde-escura e blazer bege' },
  /** Orange ape, green headphones, cream jacket (Golden Beat, Golden Signal). */
  'golden-beat': { alt: 'Macaco laranja com fones de ouvido verdes e jaqueta creme' },
  /** Black ape, round reading glasses, tweed coat (catalog filler character). */
  'onyx-scholar': { alt: 'Macaco preto com óculos de leitura redondos e casaco de tweed' },
  /** Orange ape, aviator cap and goggles, brown leather jacket (catalog filler character). */
  'amber-pilot': { alt: 'Macaco laranja com gorro de aviador, óculos de voo e jaqueta de couro marrom' },
} as const
export type ArtKey = keyof typeof ART

export const IMAGE_SIZE = 1024

const COLLECTIONS: Record<ArtKey, { id: string; name: string }> = {
  'emerald-ape': { id: 'col_kurio_apes', name: 'Kurio Apes' },
  'sage-nomad': { id: 'col_nomad_society', name: 'Nomad Society' },
  'ivory-baron': { id: 'col_ivory_court', name: 'Ivory Court' },
  'golden-beat': { id: 'col_golden_frequencies', name: 'Golden Frequencies' },
  'onyx-scholar': { id: 'col_onyx_library', name: 'Onyx Library' },
  'amber-pilot': { id: 'col_amber_skies', name: 'Amber Skies' },
}

const ART_ATTRIBUTES: Record<ArtKey, readonly string[]> = {
  'emerald-ape': ['Óculos', 'Esmeralda'],
  'sage-nomad': ['Chapéu bucket', 'Moletom'],
  'ivory-baron': ['Gola alta', 'Blazer'],
  'golden-beat': ['Fones', 'Jaqueta creme'],
  'onyx-scholar': ['Óculos de leitura', 'Tweed'],
  'amber-pilot': ['Gorro de aviador', 'Couro'],
}

const CREATORS: Record<ArtKey, NftDetail['creator']> = {
  'emerald-ape': { id: 'cr_nova_sato', name: 'Nova Sato', royaltyPercent: '5' },
  'sage-nomad': { id: 'cr_lia_moraes', name: 'Lia Moraes', royaltyPercent: '7.5' },
  'ivory-baron': { id: 'cr_theo_vance', name: 'Theo Vance', royaltyPercent: '6' },
  'golden-beat': { id: 'cr_kai_okafor', name: 'Kai Okafor', royaltyPercent: '5' },
  'onyx-scholar': { id: 'cr_iris_lund', name: 'Iris Lund', royaltyPercent: '4' },
  'amber-pilot': { id: 'cr_rafa_duarte', name: 'Rafa Duarte', royaltyPercent: '8' },
}

const RARITY_LABEL: Record<NftDetail['rarity'], string> = {
  common: 'Comum',
  rare: 'Raro',
  epic: 'Épico',
  legendary: 'Lendário',
}

const NETWORK_LABEL: Record<NftDetail['network'], string> = {
  ethereum: 'Ethereum',
  polygon: 'Polygon',
  solana: 'Solana',
}

/**
 * Edition presets (Figma chips "1/1", "1/10", "1/50", "ABERTA").
 *  - full: all four editions;
 *  - full-sold-1of1: as full but the 1/1 edition is sold out (one sold-out edition);
 *  - unique: only 1/1;
 *  - limited: 1/10 + 1/50;
 *  - open: only ABERTA;
 *  - unavailable: 1/1 already sold → `totalAvailable = 0`.
 */
type EditionPreset = 'full' | 'full-sold-1of1' | 'unique' | 'limited' | 'open' | 'unavailable'

/** name, token number, art, category, network, price, previous price, rarity, flags (n=new t=trending f=featured), editions. */
type Row = readonly [
  name: string,
  token: number,
  art: ArtKey,
  category: Category,
  network: NftDetail['network'],
  price: string,
  previousPrice: string | null,
  rarity: NftDetail['rarity'],
  flags: string,
  editions: EditionPreset,
]

/** Ordered from most to least recently listed (default sort "Listados recentemente"). */
const ROWS: readonly Row[] = [
  ['Emerald Ape', 42, 'emerald-ape', 'digital-art', 'ethereum', '1.19', null, 'rare', 'ntf', 'full'],
  ['Sage Nomad', 9, 'sage-nomad', 'digital-art', 'ethereum', '1.69', null, 'epic', 'nf', 'full'],
  ['Neon Vessel', 552, 'ivory-baron', '3d-art', 'ethereum', '1.99', '2.29', 'rare', 'nt', 'full-sold-1of1'],
  ['Cosmic Bloom', 118, 'sage-nomad', 'generative', 'polygon', '1.29', null, 'common', 'n', 'full'],
  ['Violet Nomad', 314, 'sage-nomad', 'digital-art', 'polygon', '1.39', null, 'rare', 'n', 'limited'],
  ['Ivory Baron', 88, 'ivory-baron', 'collectibles', 'ethereum', '1.79', null, 'epic', 'nt', 'unique'],
  ['Golden Beat', 207, 'golden-beat', 'music', 'solana', '0.99', null, 'common', 'nt', 'open'],
  ['Sage Drifter', 231, 'sage-nomad', 'photography', 'polygon', '0.89', null, 'common', 'n', 'full'],
  ['Golden Signal', 160, 'golden-beat', 'music', 'solana', '0.39', null, 'common', 'n', 'limited'],
  ['Onyx Scholar', 301, 'onyx-scholar', 'utility', 'ethereum', '2.45', null, 'rare', 'n', 'unique'],
  ['Amber Pilot', 77, 'amber-pilot', 'gaming', 'polygon', '0.58', null, 'common', 'n', 'full'],
  ['Emerald Regent', 12, 'emerald-ape', 'collectibles', 'ethereum', '12.30', null, 'legendary', 'tf', 'unique'],
  ['Golden Pulse', 415, 'golden-beat', 'music', 'polygon', '0.27', null, 'common', 't', 'open'],
  ['Ivory Muse', 509, 'ivory-baron', 'photography', 'ethereum', '3.40', null, 'epic', '', 'limited'],
  ['Sage Pilgrim', 640, 'sage-nomad', '3d-art', 'solana', '0.75', '0.95', 'rare', '', 'full'],
  ['Onyx Archive', 128, 'onyx-scholar', 'subscriptions', 'polygon', '0.12', null, 'common', '', 'open'],
  ['Amber Drift', 333, 'amber-pilot', 'gaming', 'solana', '0.44', null, 'common', 't', 'limited'],
  ['Emerald Echo', 205, 'emerald-ape', 'generative', 'ethereum', '2.10', null, 'rare', '', 'full'],
  ['Golden Chorus', 271, 'golden-beat', 'music', 'ethereum', '0.65', '0.80', 'common', '', 'limited'],
  ['Ivory Noir', 19, 'ivory-baron', 'digital-art', 'ethereum', '5.75', null, 'legendary', 'f', 'unique'],
  ['Sage Wanderer', 712, 'sage-nomad', 'photography', 'polygon', '0.33', null, 'common', '', 'open'],
  ['Onyx Codex', 444, 'onyx-scholar', 'utility', 'solana', '0.09', null, 'common', '', 'open'],
  ['Amber Arcade', 518, 'amber-pilot', 'gaming', 'polygon', '0.21', null, 'common', 't', 'full'],
  ['Emerald Vault', 7, 'emerald-ape', 'collectibles', 'ethereum', '8.80', null, 'legendary', '', 'unavailable'],
  ['Golden Static', 389, 'golden-beat', '3d-art', 'solana', '1.05', null, 'rare', '', 'limited'],
  ['Ivory Sculpt', 233, 'ivory-baron', '3d-art', 'polygon', '2.60', '3.10', 'epic', '', 'limited'],
  ['Sage Horizon', 156, 'sage-nomad', 'generative', 'solana', '0.48', null, 'common', '', 'full'],
  ['Onyx Ledger', 902, 'onyx-scholar', 'subscriptions', 'ethereum', '0.25', null, 'common', '', 'open'],
  ['Amber Quest', 64, 'amber-pilot', 'gaming', 'ethereum', '1.45', null, 'rare', '', 'unique'],
  ['Emerald Bloom', 318, 'emerald-ape', 'digital-art', 'polygon', '0.95', null, 'rare', 't', 'full'],
  ['Golden Lyric', 47, 'golden-beat', 'music', 'polygon', '0.18', null, 'common', '', 'open'],
  ['Ivory Lens', 615, 'ivory-baron', 'photography', 'solana', '1.25', null, 'rare', '', 'limited'],
  ['Sage Fractal', 821, 'sage-nomad', 'generative', 'polygon', '0.36', null, 'common', 't', 'open'],
  ['Onyx Key', 13, 'onyx-scholar', 'utility', 'ethereum', '4.20', null, 'epic', '', 'unique'],
  ['Amber Legend', 99, 'amber-pilot', 'gaming', 'solana', '6.40', null, 'legendary', 'f', 'unique'],
  ['Emerald Prism', 276, 'emerald-ape', '3d-art', 'ethereum', '3.95', null, 'epic', '', 'limited'],
  ['Golden Encore', 588, 'golden-beat', 'collectibles', 'solana', '0.72', null, 'rare', '', 'full'],
  ['Ivory Pass', 730, 'ivory-baron', 'subscriptions', 'polygon', '0.15', null, 'common', '', 'open'],
  ['Sage Canvas', 402, 'sage-nomad', 'digital-art', 'solana', '0.55', null, 'common', '', 'full'],
  ['Onyx Atlas', 247, 'onyx-scholar', 'collectibles', 'polygon', '1.10', null, 'rare', '', 'limited'],
  ['Amber Beacon', 860, 'amber-pilot', 'utility', 'polygon', '0.04', null, 'common', '', 'open'],
  ['Emerald Mirage', 133, 'emerald-ape', 'generative', 'solana', '2.85', '3.20', 'epic', '', 'limited'],
  ['Golden Tape', 919, 'golden-beat', 'photography', 'ethereum', '0.30', null, 'common', '', 'open'],
  ['Ivory Relic', 3, 'ivory-baron', 'collectibles', 'ethereum', '9.90', null, 'legendary', '', 'unique'],
  ['Sage Echo', 577, 'sage-nomad', '3d-art', 'ethereum', '1.60', null, 'rare', '', 'full'],
  ['Onyx Pass', 999, 'onyx-scholar', 'subscriptions', 'solana', '0.02', null, 'common', '', 'open'],
  ['Amber Glyph', 184, 'amber-pilot', 'digital-art', 'polygon', '0.82', null, 'rare', '', 'full'],
  ['Emerald Token', 650, 'emerald-ape', 'utility', 'solana', '0.06', null, 'common', '', 'open'],
]

/** Newest listing timestamp; each following row is listed 7 hours earlier. */
const NEWEST_LISTED_AT_MS = Date.UTC(2026, 10, 20, 12, 0, 0)
const LISTING_INTERVAL_MS = 7 * 60 * 60 * 1000

const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

/** Deterministic pseudo address derived from the row index (fictitious). */
function contractAddress(index: number, network: NftDetail['network']): string {
  if (network === 'solana') {
    let out = ''
    for (let i = 0; i < 44; i += 1) out += BASE58[(index * 31 + i * 17 + 7) % BASE58.length]
    return out
  }
  let hex = ''
  for (let i = 0; i < 40; i += 1) hex += ((index * 7 + i * 13 + 10) % 16).toString(16)
  return `0x${hex}`
}

function editionsFor(id: string, preset: EditionPreset, index: number): Edition[] {
  const unique = (available: 0 | 1): Edition => ({
    id: `${id}-1of1`,
    label: '1/1',
    kind: 'unique',
    supply: 1,
    available,
    maxPerOrder: 1,
  })
  const of10: Edition = {
    id: `${id}-1of10`,
    label: '1/10',
    kind: 'limited',
    supply: 10,
    available: 2 + (index % 8),
    maxPerOrder: 3,
  }
  const of50: Edition = {
    id: `${id}-1of50`,
    label: '1/50',
    kind: 'limited',
    supply: 50,
    available: 10 + ((index * 7) % 40),
    maxPerOrder: 5,
  }
  const open: Edition = {
    id: `${id}-open`,
    label: 'ABERTA',
    kind: 'open',
    supply: null,
    available: 100 + index * 5,
    maxPerOrder: 10,
  }
  switch (preset) {
    case 'full':
      return [unique(1), of10, of50, open]
    case 'full-sold-1of1':
      return [unique(0), of10, of50, open]
    case 'unique':
      return [unique(1)]
    case 'limited':
      return [of10, of50]
    case 'open':
      return [open]
    case 'unavailable':
      return [unique(0)]
  }
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function buildNft(row: Row, index: number): NftDetail {
  const [baseName, token, art, category, network, price, previousPrice, rarity, flags, preset] = row
  const id = `nft_${String(index + 1).padStart(3, '0')}`
  const tokenShort = String(token).padStart(3, '0')
  const name = `${baseName} #${tokenShort}`
  const collection = COLLECTIONS[art]
  const creator = CREATORS[art]
  const networkLabel = NETWORK_LABEL[network]
  const image: Image = { url: `/nfts/${art}.webp`, alt: `${name}: ${ART[art].alt}`, width: IMAGE_SIZE, height: IMAGE_SIZE }
  const editions = editionsFor(id, preset, index)
  const totalAvailable = editions.reduce((sum, e) => sum + e.available, 0)
  const storage = network === 'solana' ? 'Arweave' : 'IPFS'

  return {
    id,
    slug: slugify(name),
    name,
    tokenId: `#${String(token).padStart(4, '0')}`,
    collection,
    category,
    network,
    // Canonical wire form (ADR-003): "12.30" → "12.3".
    price: normalizeEth(price),
    previousPrice: previousPrice === null ? null : normalizeEth(previousPrice),
    image,
    rarity,
    flags: { isNew: flags.includes('n'), isTrending: flags.includes('t'), isFeatured: flags.includes('f') },
    totalAvailable,
    listedAt: new Date(NEWEST_LISTED_AT_MS - index * LISTING_INTERVAL_MS).toISOString(),
    version: 1,
    description: `Um colecionável digital finalizado à mão da coleção ${collection.name}, verificado na ${networkLabel}, com arte desbloqueável e acesso para colecionadores.`,
    details: [
      `${name} é uma obra digital finalizada à mão da coleção ${collection.name}. Cada atributo fica armazenado nos metadados do token e verificado na ${networkLabel}. A obra explora identidade, movimento e luz em um mundo digital sem fronteiras.`,
      `A propriedade inclui a arte em alta resolução, lançamentos exclusivos para colecionadores e um registro permanente de procedência registrada na rede. ${creator.name} recebe ${creator.royaltyPercent}% de direitos autorais nas vendas secundárias, apoiando novos trabalhos e lançamentos da comunidade.`,
    ],
    gallery: [1, 2, 3, 4].map((n) => ({ ...image, alt: `${name}, vista ${n} de 4` })),
    attributes: [...ART_ATTRIBUTES[art], RARITY_LABEL[rarity]],
    editions,
    creator,
    contract: {
      address: contractAddress(index, network),
      standard: network === 'solana' ? 'SPL' : 'ERC-721',
      metadataStorage: storage,
    },
    rating: { average: ['4.8', '4.6', '4.9', '4.5', '4.7'][index % 5] ?? '4.7', count: index === 0 ? 19 : 3 + ((index * 11) % 40) },
  }
}

/** Builds a fresh, deterministic copy of the NFT seed. */
export function createNftSeed(): NftDetail[] {
  return ROWS.map(buildNft)
}

