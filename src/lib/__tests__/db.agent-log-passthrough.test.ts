import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getAgentLog, getAgentLogPrioritized } from '../db'

const { mockFrom } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
}))

type QueryResult = { data: Record<string, unknown>[] | null; error: { message: string } | null }

let singleResult: QueryResult = { data: [], error: null }
let sellsResult: QueryResult = { data: [], error: null }
let nonSellsResult: QueryResult = { data: [], error: null }

function makeBuilder() {
  let resolveWith: () => QueryResult = () => singleResult
  const builder = {
    select: () => builder,
    order: () => builder,
    limit: () => builder,
    eq: () => {
      resolveWith = () => sellsResult
      return builder
    },
    neq: () => {
      resolveWith = () => nonSellsResult
      return builder
    },
    then: (resolve: (v: QueryResult) => void) => resolve(resolveWith()),
  }
  return builder
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: mockFrom }),
}))

function makeRow(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 'log_test',
    timestamp: '2026-09-04T18:44:59.054Z',
    symbol: 'TEST',
    action: 'HOLD',
    quantity: 0,
    reasoning: 'test reasoning',
    confidence: 0.8,
    indicators: {},
    portfolio_snapshot: { equity: '1000', cash: '500', positionCount: 1 },
    order_id: null,
    order_executed: false,
    error: null,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockFrom.mockImplementation(() => makeBuilder())
  singleResult = { data: [], error: null }
  sellsResult = { data: [], error: null }
  nonSellsResult = { data: [], error: null }
})

describe('getAgentLog() — indicators passthrough', () => {
  it('includes extra keys beyond the 16-field whitelist', async () => {
    // Arrange
    const indicators = {
      rsi: 45,
      self_flagged_disqualifying_risk: true,
      spx_regime: 'BULL',
      state_fingerprint: { adx_bucket: 'MID' },
      prevClose: 101.5,
      ema50Prev: 99.2,
      learning_note: 'test note',
    }
    singleResult = { data: [makeRow({ indicators })], error: null }

    // Act
    const result = await getAgentLog()

    // Assert
    const returned = result[0].indicators as unknown as Record<string, unknown>
    expect(returned.self_flagged_disqualifying_risk).toBe(true)
    expect(returned.spx_regime).toBe('BULL')
    expect(returned.state_fingerprint).toEqual({ adx_bucket: 'MID' })
    expect(returned.prevClose).toBe(101.5)
    expect(returned.ema50Prev).toBe(99.2)
    expect(returned.learning_note).toBe('test note')
  })

  it("preserves the 16 core fields' exact current null-coalescing defaults when explicitly null", async () => {
    // Arrange
    const indicators = {
      rsi: null, macd: null, bollingerBands: null, sma50: null, sma200: null,
      ema50: null, ema200: null, distanceToEma50Pct: null,
      currentPrice: undefined, volume: undefined, prevDayVolume: undefined,
      adx: null, atr: null, atrPercentile: null, marketRegime: null, kalman: null,
    }
    singleResult = { data: [makeRow({ indicators })], error: null }

    // Act
    const result = await getAgentLog()

    // Assert
    const ind = result[0].indicators
    expect(ind.rsi).toBeNull()
    expect(ind.macd).toBeNull()
    expect(ind.bollingerBands).toBeNull()
    expect(ind.sma50).toBeNull()
    expect(ind.sma200).toBeNull()
    expect(ind.ema50).toBeNull()
    expect(ind.ema200).toBeNull()
    expect(ind.distanceToEma50Pct).toBeNull()
    expect(ind.currentPrice).toBe(0)
    expect(ind.volume).toBe(0)
    expect(ind.prevDayVolume).toBe(0)
    expect(ind.adx).toBeNull()
    expect(ind.atr).toBeNull()
    expect(ind.atrPercentile).toBeNull()
    expect(ind.marketRegime).toBeNull()
    expect(ind.kalman).toBeNull()
  })

  it('returns the same safe-default indicators when row.indicators is absent', async () => {
    // Arrange
    const row = makeRow({})
    delete row.indicators
    singleResult = { data: [row], error: null }

    // Act
    const result = await getAgentLog()

    // Assert
    expect(result[0].indicators.rsi).toBeNull()
    expect(result[0].indicators.currentPrice).toBe(0)
    expect(result[0].indicators.kalman).toBeNull()
  })

  it('returns the same safe-default indicators when row.indicators is null', async () => {
    // Arrange
    singleResult = { data: [makeRow({ indicators: null })], error: null }

    // Act
    const result = await getAgentLog()

    // Assert
    expect(result[0].indicators.rsi).toBeNull()
    expect(result[0].indicators.currentPrice).toBe(0)
  })
})

describe('getAgentLogPrioritized() — indicators passthrough', () => {
  it('includes extra keys beyond the 16-field whitelist', async () => {
    // Arrange
    const indicators = {
      rsi: 50,
      self_flagged_disqualifying_risk: false,
      spx_regime: 'CHOP',
      near_miss_score: 7,
      what_would_trigger: 'deeper pullback',
    }
    nonSellsResult = { data: [makeRow({ id: 'nonsell_1', action: 'HOLD', indicators })], error: null }

    // Act
    const result = await getAgentLogPrioritized()

    // Assert
    const returned = result[0].indicators as unknown as Record<string, unknown>
    expect(returned.self_flagged_disqualifying_risk).toBe(false)
    expect(returned.spx_regime).toBe('CHOP')
    expect(returned.near_miss_score).toBe(7)
    expect(returned.what_would_trigger).toBe('deeper pullback')
  })

  it("preserves the 16 core fields' exact current null-coalescing defaults when explicitly null", async () => {
    // Arrange
    const indicators = {
      rsi: null, macd: null, bollingerBands: null, sma50: null, sma200: null,
      ema50: null, ema200: null, distanceToEma50Pct: null,
      currentPrice: undefined, volume: undefined, prevDayVolume: undefined,
      adx: null, atr: null, atrPercentile: null, marketRegime: null, kalman: null,
    }
    sellsResult = { data: [makeRow({ id: 'sell_1', action: 'SELL', indicators })], error: null }

    // Act
    const result = await getAgentLogPrioritized()

    // Assert
    const ind = result[0].indicators
    expect(ind.rsi).toBeNull()
    expect(ind.macd).toBeNull()
    expect(ind.bollingerBands).toBeNull()
    expect(ind.sma50).toBeNull()
    expect(ind.sma200).toBeNull()
    expect(ind.ema50).toBeNull()
    expect(ind.ema200).toBeNull()
    expect(ind.distanceToEma50Pct).toBeNull()
    expect(ind.currentPrice).toBe(0)
    expect(ind.volume).toBe(0)
    expect(ind.prevDayVolume).toBe(0)
    expect(ind.adx).toBeNull()
    expect(ind.atr).toBeNull()
    expect(ind.atrPercentile).toBeNull()
    expect(ind.marketRegime).toBeNull()
    expect(ind.kalman).toBeNull()
  })

  it('returns the same safe-default indicators when row.indicators is absent', async () => {
    // Arrange
    const row = makeRow({ id: 'nonsell_absent', action: 'HOLD' })
    delete row.indicators
    nonSellsResult = { data: [row], error: null }

    // Act
    const result = await getAgentLogPrioritized()

    // Assert
    expect(result[0].indicators.rsi).toBeNull()
    expect(result[0].indicators.currentPrice).toBe(0)
    expect(result[0].indicators.kalman).toBeNull()
  })

  it('returns the same safe-default indicators when row.indicators is null', async () => {
    // Arrange
    nonSellsResult = { data: [makeRow({ id: 'nonsell_null', action: 'HOLD', indicators: null })], error: null }

    // Act
    const result = await getAgentLogPrioritized()

    // Assert
    expect(result[0].indicators.rsi).toBeNull()
    expect(result[0].indicators.currentPrice).toBe(0)
  })
})
