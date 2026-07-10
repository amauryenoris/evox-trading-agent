import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { normalizeTimestampPrecision, getLatestSellOrder } from '../alpaca'
import type { AlpacaOrder } from '../types'

function mockFetchOrders(orders: AlpacaOrder[]) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(orders),
  }))
}

function makeOrder(overrides: Partial<AlpacaOrder> & { id: string; symbol: string }): AlpacaOrder {
  return {
    client_order_id: 'client-' + overrides.id,
    created_at: '2026-07-08T14:00:00Z',
    updated_at: '2026-07-08T14:00:00Z',
    submitted_at: '2026-07-08T14:00:00Z',
    filled_at: null,
    asset_class: 'us_equity',
    notional: null,
    qty: '10',
    filled_qty: '10',
    filled_avg_price: '100.00',
    order_class: 'simple',
    order_type: 'market',
    type: 'market',
    side: 'sell',
    time_in_force: 'day',
    limit_price: null,
    stop_price: null,
    status: 'filled',
    ...overrides,
  }
}

beforeEach(() => {
  process.env.ALPACA_API_KEY    = 'test-key'
  process.env.ALPACA_SECRET_KEY = 'test-secret'
  process.env.ALPACA_BASE_URL   = 'https://paper-api.alpaca.markets'
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('normalizeTimestampPrecision', () => {
  it('truncates 9-digit nanosecond precision to fixed 3-digit ms', () => {
    // Arrange / Act
    const result = normalizeTimestampPrecision('2026-04-30T14:25:59.639949215Z')

    // Assert
    expect(result).toBe('2026-04-30T14:25:59.639Z')
  })

  it('returns an already 3-digit-ms value unchanged', () => {
    // Arrange / Act
    const result = normalizeTimestampPrecision('2026-06-09T16:19:01.019Z')

    // Assert
    expect(result).toBe('2026-06-09T16:19:01.019Z')
  })

  it.each([
    ['2026-05-21T13:47:19.80793Z', '2026-05-21T13:47:19.807Z'],
    ['2026-05-21T17:55:42.222356Z', '2026-05-21T17:55:42.222Z'],
  ])('normalizes %s to fixed 3-digit ms %s', (input, expected) => {
    expect(normalizeTimestampPrecision(input)).toBe(expected)
  })

  it('collapses two timestamps sharing an identical 3-digit fractional prefix to the same normalized value', () => {
    // Arrange — same millisecond, differing only in trailing sub-ms digits
    // (the prefix-collision case that causes raw text comparison to
    // misorder — see design.md Alternatives Considered)
    const shortForm = '2026-07-08T14:07:48.446Z'
    const longForm = '2026-07-08T14:07:48.4460481Z'

    // Act
    const normalizedShort = normalizeTimestampPrecision(shortForm)
    const normalizedLong = normalizeTimestampPrecision(longForm)

    // Assert — no longer distinguished by the 'Z'-vs-digit ASCII artifact
    expect(normalizedShort).toBe(normalizedLong)
  })
})

describe('getLatestSellOrder — normalized comparison', () => {
  it('selects the chronologically latest fill among mixed-precision Alpaca timestamps', async () => {
    // Arrange — mirrors live-observed precision variance (3/6/9 digit fractional seconds)
    mockFetchOrders([
      makeOrder({ id: 'a', symbol: 'AAPL', filled_at: '2026-07-08T14:07:48.446Z' }),
      makeOrder({ id: 'b', symbol: 'AAPL', filled_at: '2026-07-08T15:24:05.590536Z' }),
      makeOrder({ id: 'c', symbol: 'AAPL', filled_at: '2026-07-08T13:00:00.639949215Z' }),
    ])

    // Act
    const result = await getLatestSellOrder('AAPL', '2026-07-08T12:00:00.000Z')

    // Assert — order 'b' (15:24) is genuinely the latest despite fewer fractional digits than 'c'
    expect(result?.id).toBe('b')
  })

  it('excludes a fill whose normalized value ties with afterTimestamp (same millisecond, extra sub-ms precision)', async () => {
    // Arrange — prefix-collision case: fill lands in the exact same ms as afterTimestamp
    mockFetchOrders([
      makeOrder({ id: 'tie', symbol: 'AAPL', filled_at: '2026-07-08T14:07:48.4460481Z' }),
    ])

    // Act
    const result = await getLatestSellOrder('AAPL', '2026-07-08T14:07:48.446Z')

    // Assert — strictly-after semantics preserved; a tie is not "after"
    expect(result).toBeNull()
  })

  it('returns the order with its original, unnormalized filled_at intact', async () => {
    // Arrange
    mockFetchOrders([
      makeOrder({ id: 'a', symbol: 'AAPL', filled_at: '2026-07-08T15:24:05.590536Z' }),
    ])

    // Act
    const result = await getLatestSellOrder('AAPL', '2026-07-08T12:00:00.000Z')

    // Assert — comparison was normalized internally, but the returned data is untouched
    expect(result?.filled_at).toBe('2026-07-08T15:24:05.590536Z')
  })

  it('regression: filter/sort behavior unchanged for distinct, non-colliding timestamps', async () => {
    // Arrange
    mockFetchOrders([
      makeOrder({ id: 'earlier', symbol: 'MSFT', filled_at: '2026-07-08T13:00:00.000Z' }),
      makeOrder({ id: 'latest', symbol: 'MSFT', filled_at: '2026-07-08T16:00:00.000Z' }),
      makeOrder({ id: 'other-symbol', symbol: 'AAPL', filled_at: '2026-07-08T17:00:00.000Z' }),
      makeOrder({ id: 'buy-side', symbol: 'MSFT', side: 'buy', filled_at: '2026-07-08T18:00:00.000Z' }),
    ])

    // Act
    const result = await getLatestSellOrder('MSFT', '2026-07-08T12:00:00.000Z')

    // Assert — most recent MSFT sell fill wins; other symbols/sides ignored
    expect(result?.id).toBe('latest')
  })
})
