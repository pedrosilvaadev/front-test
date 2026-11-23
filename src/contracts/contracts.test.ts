import type { z } from 'zod'
import { ApiError, isErrorEnvelope, kindFromStatus } from '@/api/errors'
import {
  addCartItemRequestSchema,
  authResponseSchema,
  catalogFacetsSchema,
  catalogQuerySchema,
  changePasswordFormSchema,
  createOrderRequestSchema,
  DEFAULT_CATALOG_QUERY,
  editionSchema,
  ERROR_CATALOGUE,
  profileSchema,
  transactionSchema,
  updateProfileRequestSchema,
  walletSchema,
  walletsResponseSchema,
  errorEnvelopeSchema,
  ethAmountSchema,
  isErrorCode,
  isNewerVersion,
  isTerminalOrderStatus,
  nftDetailSchema,
  nftUpdatedEventSchema,
  orderSchema,
  orderUpdatedEventSchema,
  quoteChangedDetailsSchema,
  quoteSchema,
  registerFormSchema,
  serializeCatalogQuery,
  toFieldErrorsDetails,
  updateAvatarRequestSchema,
  walletInputSchema,
  type ErrorCode,
} from './index'

const image = { url: '/nfts/emerald-ape.webp', alt: 'Emerald Ape #042', width: 800, height: 800 }
const NOW = '2026-07-29T12:00:00.000Z'
const UUID = '6f1c2b1e-8a4d-4c3b-9f7e-2d5a1b0c9e8f'
const TX = {
  hash: `0x${'a'.repeat(64)}`,
  explorerUrl: `https://sepolia.etherscan.io/tx/0x${'a'.repeat(64)}`,
}
const DECLINE = { reason: 'PAYMENT_DECLINED', message: 'Declined' }
const EVM = '0x7a42000000000000000000000000000000019e8a'

/**
 * Response objects strip unknown keys (ADR-002), so a fixture with a typo'd or
 * extra field would silently lose it. Fixtures must round-trip exactly.
 */
function expectExactParse(schema: z.ZodType, fixture: unknown) {
  const result = schema.safeParse(fixture)
  expect(result.error).toBeUndefined()
  expect(result.data).toStrictEqual(fixture)
}

describe('ethAmountSchema', () => {
  it('accepts decimal strings and rejects numbers, negatives and exponents', () => {
    expect(ethAmountSchema.safeParse('1.19').success).toBe(true)
    expect(ethAmountSchema.safeParse('0.016').success).toBe(true)
    expect(ethAmountSchema.safeParse(1.19).success).toBe(false)
    expect(ethAmountSchema.safeParse('-1').success).toBe(false)
    expect(ethAmountSchema.safeParse('1e-3').success).toBe(false)
    expect(ethAmountSchema.safeParse('1.0000000000000000001').success).toBe(false)
  })
})

describe('catalogQuerySchema', () => {
  it('fills defaults for an empty query', () => {
    expect(catalogQuerySchema.parse({})).toEqual(DEFAULT_CATALOG_QUERY)
  })

  it('normalizes raw URL params (csv lists sorted + deduplicated, numbers coerced, q trimmed)', () => {
    const parsed = catalogQuerySchema.parse({
      q: '  ape ',
      categories: 'music,digital-art,music',
      networks: 'solana,ethereum',
      minPrice: '0.02',
      maxPrice: '12.30',
      tab: 'trending',
      sort: 'price-desc',
      page: '3',
      pageSize: '12',
    })
    expect(parsed).toEqual({
      q: 'ape',
      categories: ['digital-art', 'music'],
      networks: ['ethereum', 'solana'],
      minPrice: '0.02',
      maxPrice: '12.3', // canonicalized so equivalent URLs share a query key
      tab: 'trending',
      sort: 'price-desc',
      page: 3,
      pageSize: 12,
    })
  })

  it('round-trips through serializeCatalogQuery, omitting defaults', () => {
    expect(serializeCatalogQuery(DEFAULT_CATALOG_QUERY)).toEqual({})
    const query = catalogQuerySchema.parse({ categories: ['music', 'gaming'], page: 2, q: '' })
    const params = serializeCatalogQuery(query)
    expect(params).toEqual({ categories: 'gaming,music', page: '2' })
    expect(catalogQuerySchema.parse(params)).toEqual(query)
  })

  it('accepts already-normalized arrays (response echo)', () => {
    const query = catalogQuerySchema.parse({ networks: ['polygon'] })
    expect(catalogQuerySchema.parse(query)).toEqual(query)
  })

  it('rejects invalid values', () => {
    expect(catalogQuerySchema.safeParse({ categories: 'paintings' }).success).toBe(false)
    expect(catalogQuerySchema.safeParse({ page: '0' }).success).toBe(false)
    for (const page of ['1.5', '1e1', ' 2', '0x10', '', '-1', 'abc', 2.5]) {
      expect(catalogQuerySchema.safeParse({ page }).success, String(page)).toBe(false)
    }
    expect(catalogQuerySchema.safeParse({ pageSize: '1000' }).success).toBe(false)
    expect(catalogQuerySchema.safeParse({ pageSize: '48' }).success).toBe(true)
    // invalid bounds fail validation instead of throwing from money helpers
    expect(catalogQuerySchema.safeParse({ minPrice: 'abc', maxPrice: '1' }).success).toBe(false)
    expect(catalogQuerySchema.safeParse({ minPrice: '1', maxPrice: '-1' }).success).toBe(false)
    expect(catalogQuerySchema.safeParse({ minPrice: '1.0', maxPrice: '1' }).success).toBe(true)
    expect(catalogQuerySchema.safeParse({ sort: 'random' }).success).toBe(false)
    const inverted = catalogQuerySchema.safeParse({ minPrice: '5', maxPrice: '1' })
    expect(inverted.success).toBe(false)
    expect(inverted.error?.issues[0]?.path).toEqual(['maxPrice'])
  })
})

describe('catalog facets', () => {
  it('requires a count for every category and network', () => {
    const facets = {
      categories: {
        'digital-art': 33,
        photography: 12,
        music: 65,
        '3d-art': 39,
        collectibles: 23,
        generative: 17,
        gaming: 19,
        subscriptions: 13,
        utility: 18,
      },
      networks: { ethereum: 119, polygon: 78, solana: 86 },
      priceRange: { min: '0.02', max: '12.3' },
    }
    expect(catalogFacetsSchema.safeParse(facets).success).toBe(true)
    const { solana: _omit, ...partialNetworks } = facets.networks
    void _omit
    expect(catalogFacetsSchema.safeParse({ ...facets, networks: partialNetworks }).success).toBe(false)
  })
})

describe('nft detail', () => {
  it('parses a design-shaped NFT', () => {
    const nft = {
      id: 'nft_042',
      slug: 'emerald-ape-042',
      name: 'Emerald Ape #042',
      tokenId: '#0042',
      collection: { id: 'col_kurio_apes', name: 'Kurio Apes' },
      category: 'digital-art',
      network: 'ethereum',
      price: '1.19',
      previousPrice: null,
      image,
      rarity: 'rare',
      flags: { isNew: false, isTrending: true, isFeatured: true },
      totalAvailable: 60,
      listedAt: NOW,
      version: 1,
      description: 'Um colecionável digital...',
      details: ['Paragraph'],
      gallery: [image, image, image, image],
      attributes: ['Óculos', 'Esmeralda', 'Raro'],
      editions: [
        { id: 'ed_1of1', label: '1/1', kind: 'unique', supply: 1, available: 0, maxPerOrder: 1 },
        { id: 'ed_1of50', label: '1/50', kind: 'limited', supply: 50, available: 12, maxPerOrder: 10 },
        { id: 'ed_open', label: 'ABERTA', kind: 'open', supply: null, available: 48, maxPerOrder: 20 },
      ],
      creator: { id: 'usr_nova', name: 'Nova Sato', royaltyPercent: '5' },
      contract: { address: '0x7A42...19E8', standard: 'ERC-721', metadataStorage: 'IPFS' },
      rating: { average: '4.8', count: 19 },
    }
    expectExactParse(nftDetailSchema, nft)
    expect(nftDetailSchema.safeParse({ ...nft, price: 1.19 }).success).toBe(false)
  })

  it('enforces edition supply/availability invariants', () => {
    const valid = [
      { id: 'a', label: '1/1', kind: 'unique', supply: 1, available: 1, maxPerOrder: 1 },
      { id: 'b', label: '1/50', kind: 'limited', supply: 50, available: 50, maxPerOrder: 10 },
      { id: 'c', label: 'ABERTA', kind: 'open', supply: null, available: 1000, maxPerOrder: 20 },
    ]
    for (const edition of valid) expectExactParse(editionSchema, edition)
    const invalid = [
      { id: 'a', label: '1/1', kind: 'unique', supply: 2, available: 1, maxPerOrder: 1 },
      { id: 'b', label: '1/50', kind: 'limited', supply: 50, available: 51, maxPerOrder: 10 },
      { id: 'b', label: '1/50', kind: 'limited', supply: null, available: 5, maxPerOrder: 10 },
      { id: 'c', label: 'ABERTA', kind: 'open', supply: 100, available: 10, maxPerOrder: 20 },
    ]
    for (const edition of invalid) expect(editionSchema.safeParse(edition).success, edition.label).toBe(false)
  })
})

describe('error catalogue', () => {
  it('maps every code to the ApiError kind derived from its HTTP status', () => {
    for (const [code, { status, kind }] of Object.entries(ERROR_CATALOGUE)) {
      expect(kindFromStatus(status), code).toBe(kind)
    }
  })

  it('covers the README §5 error families', () => {
    const required: ErrorCode[] = [
      'VALIDATION_ERROR',
      'SESSION_EXPIRED',
      'UNAUTHORIZED',
      'FORBIDDEN',
      'NFT_NOT_FOUND',
      'AVAILABILITY_CONFLICT',
      'IDEMPOTENCY_CONFLICT',
      'QUOTE_CHANGED',
      'SERVER_UNAVAILABLE',
    ]
    for (const code of required) expect(isErrorCode(code)).toBe(true)
    // the client's default transient code is a catalogue code
    expect(isErrorCode(new ApiError({ kind: 'transient' }).code)).toBe(true)
    expect(isErrorCode('NOPE')).toBe(false)
  })

  it('envelope schema agrees with the client envelope guard', () => {
    const body = { error: { code: 'SESSION_EXPIRED', message: 'Session expired.' } }
    expect(errorEnvelopeSchema.safeParse(body).success).toBe(true)
    expect(isErrorEnvelope(body)).toBe(true)
    expect(errorEnvelopeSchema.safeParse({ error: { code: 'X' } }).success).toBe(false)
    expect(isErrorEnvelope({ error: { code: 'X' } })).toBe(false)
  })

  it('converts zod errors into fieldErrors details', () => {
    const result = registerFormSchema.safeParse({
      username: 'A!',
      email: 'not-an-email',
      password: 'abcdefgh1',
      confirmPassword: 'different1',
    })
    expect(result.success).toBe(false)
    const details = toFieldErrorsDetails(result.error!)
    // zod v4 still runs the object-level refine when field checks fail (non-aborting issues).
    expect(Object.keys(details.fieldErrors).sort()).toEqual(['confirmPassword', 'email', 'username'])
  })

  it('reports the confirm-password mismatch on confirmPassword', () => {
    const result = registerFormSchema.safeParse({
      username: 'collector',
      email: 'a@b.co',
      password: 'abcdefgh1',
      confirmPassword: 'different1',
    })
    expect(toFieldErrorsDetails(result.error!).fieldErrors).toHaveProperty('confirmPassword')
  })
})

describe('account forms', () => {
  it('validates password change confirmation and reuse', () => {
    expect(
      changePasswordFormSchema.safeParse({ currentPassword: 'old', newPassword: 'newpass12', confirmPassword: 'newpass12' })
        .success,
    ).toBe(true)
    expect(
      changePasswordFormSchema.safeParse({ currentPassword: 'samepass1', newPassword: 'samepass1', confirmPassword: 'samepass1' })
        .success,
    ).toBe(false)
  })

  it('accepts only small png/jpeg/webp avatar data URLs', () => {
    expect(updateAvatarRequestSchema.safeParse({ dataUrl: 'data:image/png;base64,iVBORw0KGgo=' }).success).toBe(true)
    expect(updateAvatarRequestSchema.safeParse({ dataUrl: 'data:image/svg+xml;base64,PHN2Zz4=' }).success).toBe(false)
    expect(updateAvatarRequestSchema.safeParse({ dataUrl: 'https://example.com/a.png' }).success).toBe(false)
  })
})

describe('wallets', () => {
  const base = {
    label: 'Main',
    displayName: 'Ana Collector',
    profileName: 'ana',
    email: 'ana@example.com',
    network: 'ethereum',
    provider: 'metamask',
    address: EVM,
    alternateAddress: null,
    ensName: 'ana.eth',
    referralCode: 'kurio1',
  }

  it('validates the address against the selected network', () => {
    const ok = walletInputSchema.parse(base)
    expect(ok.referralCode).toBe('KURIO1')
    const wrong = walletInputSchema.safeParse({ ...base, network: 'solana' })
    expect(wrong.success).toBe(false)
    expect(wrong.error?.issues[0]?.path).toEqual(['address'])
    expect(
      walletInputSchema.safeParse({ ...base, network: 'solana', address: '7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV' })
        .success,
    ).toBe(true)
  })

  it('carries the persisted connection state, bound to the wallet and its network', () => {
    const wallet = {
      id: 'w_1',
      slot: 'primary',
      ...base,
      referralCode: 'KURIO1',
      connection: { walletId: 'w_1', slot: 'primary', network: 'ethereum', status: 'connected', connectedAt: NOW },
      createdAt: NOW,
      updatedAt: NOW,
    }
    expectExactParse(walletSchema, wallet)
    expectExactParse(walletsResponseSchema, { primary: { ...wallet, connection: null }, secondary: null })
    expect(walletSchema.safeParse({ ...wallet, connection: { ...wallet.connection, network: 'polygon' } }).success).toBe(false)
    expect(walletSchema.safeParse({ ...wallet, connection: { ...wallet.connection, walletId: 'w_2' } }).success).toBe(false)
    const { connection: _c, ...withoutConnection } = wallet
    void _c
    expect(walletSchema.safeParse(withoutConnection).success).toBe(false)
    expect(isErrorCode('WALLET_NETWORK_MISMATCH')).toBe(true)
  })
})

describe('profile', () => {
  const profile = {
    userId: 'usr_1',
    displayName: 'ana',
    username: 'ana',
    email: 'ana@example.com',
    ensName: null,
    walletNickname: null,
    avatarUrl: null,
    updatedAt: NOW,
  }

  it('accepts a freshly registered profile (displayName = username, nullable extras)', () => {
    expectExactParse(profileSchema, profile)
  })

  it('requires walletNickname when saving the profile form', () => {
    const { userId: _u, avatarUrl: _a, updatedAt: _t, ...editable } = profile
    void [_u, _a, _t]
    expect(updateProfileRequestSchema.safeParse(editable).success).toBe(false)
    expect(updateProfileRequestSchema.safeParse({ ...editable, walletNickname: 'Main' }).success).toBe(true)
  })
})

describe('cart, quote and orders', () => {
  it('requires integer quantities', () => {
    expect(addCartItemRequestSchema.safeParse({ nftId: 'n', editionId: 'e', quantity: 2 }).success).toBe(true)
    expect(addCartItemRequestSchema.safeParse({ nftId: 'n', editionId: 'e', quantity: 1.5 }).success).toBe(false)
    expect(addCartItemRequestSchema.safeParse({ nftId: 'n', editionId: 'e', quantity: 0 }).success).toBe(false)
    expect(addCartItemRequestSchema.safeParse({ nftId: 'n', editionId: 'e', quantity: '2' }).success).toBe(false)
  })

  const line = {
    cartItemId: 'ci_1',
    nftId: 'nft_042',
    editionId: 'ed_1of50',
    name: 'Emerald Ape #042',
    tokenId: '#0042',
    editionLabel: '1/50',
    image,
    unitPrice: '1.19',
    quantity: 2,
    lineTotal: '2.38',
    available: 12,
    nftVersion: 3,
  }
  const quote = {
    quoteId: 'q_1',
    cartVersion: 4,
    network: 'ethereum',
    currency: 'ETH',
    lines: [line],
    coupon: null,
    subtotal: '2.38',
    discount: '0',
    networkFee: '0.016',
    total: '2.396',
    changes: [],
    purchasable: true,
    issuedAt: NOW,
    expiresAt: NOW,
  }

  it('parses a quote and QUOTE_CHANGED details with typed changes', () => {
    expect(quoteSchema.parse(quote).total).toBe('2.396')
    const details = quoteChangedDetailsSchema.parse({
      changes: [
        { type: 'price_changed', nftId: 'nft_042', editionId: 'ed_1of50', previousUnitPrice: '1.19', unitPrice: '1.29' },
        { type: 'coupon_invalidated', code: 'GENESIS10', reason: 'expired' },
      ],
      quote,
    })
    expect(details.changes.map((c) => c.type)).toEqual(['price_changed', 'coupon_invalidated'])
    expect(quoteChangedDetailsSchema.safeParse({ changes: [], quote }).success).toBe(false)
  })

  it('validates create-order payloads and the receipt snapshot', () => {
    const buyer = {
      displayName: 'Ana Collector',
      username: 'ana',
      profileName: 'ana',
      email: 'ana@example.com',
      ensName: 'ana.eth',
      referralCode: 'KURIO1',
    }
    expect(createOrderRequestSchema.safeParse({ quoteId: 'q_1', network: 'ethereum', walletId: 'w_1', buyer }).success).toBe(true)
    const { cartItemId: _id, available: _av, nftVersion: _v, ...receiptLine } = line
    void [_id, _av, _v]
    const confirmed = {
      id: 'ord_1',
      status: 'confirmed',
      idempotencyKey: UUID,
      quoteId: 'q_1',
      network: 'ethereum',
      wallet: { id: 'w_1', slot: 'primary', label: 'Main', provider: 'metamask', address: EVM },
      buyer,
      receipt: {
        currency: 'ETH',
        lines: [receiptLine],
        couponCode: null,
        subtotal: '2.38',
        discount: '0',
        networkFee: '0.016',
        total: '2.396',
      },
      transaction: TX,
      decline: null,
      createdAt: NOW,
      updatedAt: NOW,
      version: 2,
    }
    expectExactParse(orderSchema, confirmed)
    expect(isTerminalOrderStatus(orderSchema.parse(confirmed).status)).toBe(true)
    expect(isTerminalOrderStatus('pending')).toBe(false)

    // status ↔ transaction/decline invariants
    const pending = { ...confirmed, status: 'pending', transaction: null }
    const declined = { ...confirmed, status: 'declined', transaction: null, decline: DECLINE }
    expectExactParse(orderSchema, pending)
    expectExactParse(orderSchema, declined)
    expect(orderSchema.safeParse({ ...confirmed, transaction: null }).success).toBe(false)
    expect(orderSchema.safeParse({ ...pending, transaction: TX }).success).toBe(false)
    expect(orderSchema.safeParse({ ...declined, decline: null }).success).toBe(false)
    expect(orderSchema.safeParse({ ...confirmed, decline: DECLINE }).success).toBe(false)
  })

  it('only accepts https explorer links', () => {
    const hash = TX.hash
    expect(transactionSchema.safeParse(TX).success).toBe(true)
    for (const explorerUrl of [`javascript:alert(1)//${hash}`, `http://etherscan.io/tx/${hash}`, `data:text/html,${hash}`]) {
      expect(transactionSchema.safeParse({ hash, explorerUrl }).success, explorerUrl).toBe(false)
    }
  })
})

describe('auth response', () => {
  it('parses a session with an optional cart merge result', () => {
    const parsed = authResponseSchema.parse({
      session: {
        token: 'tok_0123456789abcdef',
        expiresAt: NOW,
        user: { id: 'usr_1', username: 'ana', email: 'ANA@example.com', displayName: 'Ana', avatarUrl: null },
      },
      cartMerge: {
        mergedItems: 1,
        adjustments: [{ nftId: 'n', editionId: 'e', requested: 5, applied: 3, reason: 'availability' }],
      },
    })
    expect(parsed.session.user.email).toBe('ana@example.com')
  })
})

describe('realtime events', () => {
  it('parses versioned nft.updated and order.updated envelopes', () => {
    const nftEvent = nftUpdatedEventSchema.parse({
      eventId: UUID,
      type: 'nft.updated',
      schemaVersion: 1,
      resource: { type: 'nft', id: 'nft_042' },
      version: 5,
      occurredAt: NOW,
      data: {
        nftId: 'nft_042',
        price: '1.29',
        previousPrice: '1.19',
        totalAvailable: 11,
        editions: [{ editionId: 'ed_1of50', available: 11 }],
      },
    })
    expect(nftEvent.version).toBe(5)

    const orderEvent = {
      eventId: UUID,
      type: 'order.updated',
      schemaVersion: 1,
      resource: { type: 'order', id: 'ord_1' },
      version: 2,
      occurredAt: NOW,
      data: { orderId: 'ord_1', userId: 'usr_1', status: 'declined', transaction: null, decline: DECLINE, updatedAt: NOW },
    }
    expectExactParse(orderUpdatedEventSchema, orderEvent)
    expect(
      orderUpdatedEventSchema.safeParse({ ...orderEvent, data: { ...orderEvent.data, status: 'confirmed' } }).success,
    ).toBe(false)
    expect(
      orderUpdatedEventSchema.safeParse({
        ...orderEvent,
        data: { ...orderEvent.data, status: 'confirmed', transaction: TX, decline: null },
      }).success,
    ).toBe(true)
    expect(orderUpdatedEventSchema.safeParse({ ...orderEvent, schemaVersion: 2 }).success).toBe(false)
    expect(orderUpdatedEventSchema.safeParse({ ...orderEvent, type: 'nft.updated' }).success).toBe(false)
  })

  it('applies only strictly newer versions', () => {
    expect(isNewerVersion(3, undefined)).toBe(true)
    expect(isNewerVersion(3, 2)).toBe(true)
    expect(isNewerVersion(3, 3)).toBe(false)
    expect(isNewerVersion(2, 3)).toBe(false)
  })
})
