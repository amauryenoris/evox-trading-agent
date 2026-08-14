import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getTradeEvaluations } from '../db'

const { mockSelect, mockOrder, mockLimit, mockGte, mockFrom } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockOrder: vi.fn(),
  mockLimit: vi.fn(),
  mockGte: vi.fn(),
  mockFrom: vi.fn(),
}))

let queryResult: { data: Record<string, unknown>[] | null; error: { message: string } | null } = {
  data: [],
  error: null,
}

const sharedBuilder = {
  select: mockSelect,
  order: mockOrder,
  limit: mockLimit,
  gte: mockGte,
  then: (resolve: (v: typeof queryResult) => void) => resolve(queryResult),
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: mockFrom }),
}))

function makeRow(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 'eval_test',
    symbol: 'TEST',
    buy_timestamp: '2026-07-14T14:25:01.627Z',
    sell_timestamp: '2026-07-14T15:09:02.857Z',
    entry_price: 100,
    exit_price: 101,
    quantity: 10,
    pnl_usd: 10,
    pnl_pct: 1,
    holding_period_hours: 24,
    indicators_at_buy: {},
    buy_reasoning: 'test post-mortem',
    lessons: [],
    outcome: 'profit',
    signal_type: 'TREND_ZLE05',
    state_fingerprint: null,
    ...overrides,
  }
}

describe('getTradeEvaluations() — buyIndicators passthrough', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFrom.mockReturnValue(sharedBuilder)
    mockSelect.mockReturnValue(sharedBuilder)
    mockOrder.mockReturnValue(sharedBuilder)
    mockLimit.mockReturnValue(sharedBuilder)
    mockGte.mockReturnValue(sharedBuilder)
    queryResult = { data: [], error: null }
  })

  it('includes extra keys beyond the 16-field whitelist (spx_price, effectiveThreshold, sectorRotation, tp_zscore)', async () => {
    // Arrange
    const indicatorsAtBuy = {
      rsi: 45,
      spx_price: 6500,
      spx_regime: 'BULL',
      effectiveThreshold: -1.42,
      newsAdjustment: -0.12,
      sectorRotation: { gdx_relative_strength_pct: 1.2, xle_relative_strength_pct: -0.5, xlk_relative_strength_pct: 0.3 },
      sectorRotationContext: 'Gold/Mining (GDX): +1.20% vs SPY (20d)',
      tp_zscore: 0.8,
      tp_population_bucket: 'CONTINUATION',
    }
    queryResult = { data: [makeRow({ indicators_at_buy: indicatorsAtBuy })], error: null }

    // Act
    const result = await getTradeEvaluations()

    // Assert
    const buyIndicators = result[0].buyIndicators as unknown as Record<string, unknown>
    expect(buyIndicators.spx_price).toBe(6500)
    expect(buyIndicators.spx_regime).toBe('BULL')
    expect(buyIndicators.effectiveThreshold).toBe(-1.42)
    expect(buyIndicators.newsAdjustment).toBe(-0.12)
    expect(buyIndicators.sectorRotation).toEqual(indicatorsAtBuy.sectorRotation)
    expect(buyIndicators.sectorRotationContext).toBe('Gold/Mining (GDX): +1.20% vs SPY (20d)')
    expect(buyIndicators.tp_zscore).toBe(0.8)
    expect(buyIndicators.tp_population_bucket).toBe('CONTINUATION')
  })

  it('preserves the 16 core fields\' exact current null-coalescing defaults when explicitly null', async () => {
    // Arrange
    const indicatorsAtBuy = {
      rsi: null,
      macd: null,
      bollingerBands: null,
      sma50: null,
      sma200: null,
      ema50: null,
      ema200: null,
      distanceToEma50Pct: null,
      currentPrice: undefined,
      volume: undefined,
      prevDayVolume: undefined,
      adx: null,
      atr: null,
      atrPercentile: null,
      marketRegime: null,
    }
    queryResult = { data: [makeRow({ indicators_at_buy: indicatorsAtBuy })], error: null }

    // Act
    const result = await getTradeEvaluations()

    // Assert
    expect(result[0].buyIndicators.rsi).toBeNull()
    expect(result[0].buyIndicators.macd).toBeNull()
    expect(result[0].buyIndicators.bollingerBands).toBeNull()
    expect(result[0].buyIndicators.sma50).toBeNull()
    expect(result[0].buyIndicators.sma200).toBeNull()
    expect(result[0].buyIndicators.ema50).toBeNull()
    expect(result[0].buyIndicators.ema200).toBeNull()
    expect(result[0].buyIndicators.distanceToEma50Pct).toBeNull()
    expect(result[0].buyIndicators.currentPrice).toBe(0)
    expect(result[0].buyIndicators.volume).toBe(0)
    expect(result[0].buyIndicators.prevDayVolume).toBe(0)
    expect(result[0].buyIndicators.adx).toBeNull()
    expect(result[0].buyIndicators.atr).toBeNull()
    expect(result[0].buyIndicators.atrPercentile).toBeNull()
    expect(result[0].buyIndicators.marketRegime).toBeNull()
  })

  it('preserves current defaults when a core key is missing entirely from the raw jsonb', async () => {
    // Arrange — raw jsonb only has one unrelated key, none of the 16 core fields present
    queryResult = { data: [makeRow({ indicators_at_buy: { spx_price: 6500 } })], error: null }

    // Act
    const result = await getTradeEvaluations()

    // Assert — same defaults as an empty object would produce
    expect(result[0].buyIndicators.rsi).toBeNull()
    expect(result[0].buyIndicators.currentPrice).toBe(0)
    expect(result[0].buyIndicators.volume).toBe(0)
    expect((result[0].buyIndicators as unknown as Record<string, unknown>).spx_price).toBe(6500)
  })

  it('returns the same safe-default buyIndicators when indicators_at_buy is absent', async () => {
    // Arrange
    const row = makeRow({})
    delete row.indicators_at_buy
    queryResult = { data: [row], error: null }

    // Act
    const result = await getTradeEvaluations()

    // Assert
    expect(result[0].buyIndicators.rsi).toBeNull()
    expect(result[0].buyIndicators.currentPrice).toBe(0)
    expect(result[0].buyIndicators.volume).toBe(0)
    expect(result[0].buyIndicators.prevDayVolume).toBe(0)
    expect(result[0].buyIndicators.kalman).toBeNull()
  })

  it('returns the same safe-default buyIndicators when indicators_at_buy is null', async () => {
    // Arrange
    queryResult = { data: [makeRow({ indicators_at_buy: null })], error: null }

    // Act
    const result = await getTradeEvaluations()

    // Assert
    expect(result[0].buyIndicators.rsi).toBeNull()
    expect(result[0].buyIndicators.currentPrice).toBe(0)
  })

  it('preserves the exact kalman defaulting quirk (falls through raw.kalman, not raw.indicators_at_buy.kalman)', async () => {
    // Arrange — kalman set directly on indicators_at_buy (the real-world shape); the
    // raw.indicators_at_buy?.kalman branch is always undefined since raw has no such key
    const kalmanSnapshot = { stateEstimate: 100, forecastError: -1.5, errorStdDev: 0.8, zScore: -1.875, signal: 'MEAN_REVERSION_LONG' as const }
    queryResult = { data: [makeRow({ indicators_at_buy: { kalman: kalmanSnapshot } })], error: null }

    // Act
    const result = await getTradeEvaluations()

    // Assert
    expect(result[0].buyIndicators.kalman).toEqual(kalmanSnapshot)
  })
})
