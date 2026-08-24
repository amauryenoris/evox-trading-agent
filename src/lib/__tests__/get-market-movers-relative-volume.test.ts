import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { getMarketMovers } from '../alpaca'

function mockScreenerAndSnapshots(
  actives: Array<{ symbol: string; volume: number }>,
  snapshots: Record<string, { latestTrade?: { p: number }; prevDailyBar?: { c: number } }>
) {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        most_actives: actives.map((a) => ({ symbol: a.symbol, volume: a.volume, trade_count: 0 })),
      }),
    })
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => snapshots,
    })
  vi.stubGlobal('fetch', fetchMock)
}

beforeEach(() => {
  process.env.ALPACA_API_KEY = 'test-key'
  process.env.ALPACA_SECRET_KEY = 'test-secret'
  process.env.ALPACA_DATA_URL = 'https://data.alpaca.markets'
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('getMarketMovers — relativeVolume', () => {
  it('computes relativeVolume as each candidate volume divided by the batch average', async () => {
    // Arrange
    // volumes: 100, 200, 300 → avg = 200
    mockScreenerAndSnapshots(
      [
        { symbol: 'AAA', volume: 100 },
        { symbol: 'BBB', volume: 200 },
        { symbol: 'CCC', volume: 300 },
      ],
      {
        AAA: { latestTrade: { p: 10 }, prevDailyBar: { c: 10 } },
        BBB: { latestTrade: { p: 20 }, prevDailyBar: { c: 20 } },
        CCC: { latestTrade: { p: 30 }, prevDailyBar: { c: 30 } },
      }
    )

    // Act
    const result = await getMarketMovers(3)

    // Assert
    const bySymbol = Object.fromEntries(result.map((r) => [r.symbol, r]))
    expect(bySymbol.AAA.relativeVolume).toBeCloseTo(0.5, 5)
    expect(bySymbol.BBB.relativeVolume).toBeCloseTo(1, 5)
    expect(bySymbol.CCC.relativeVolume).toBeCloseTo(1.5, 5)
  })

  it('returns an empty array without crashing when the screener has no candidates', async () => {
    // Arrange
    mockScreenerAndSnapshots([], {})

    // Act
    const result = await getMarketMovers(3)

    // Assert
    expect(result).toEqual([])
  })
})
