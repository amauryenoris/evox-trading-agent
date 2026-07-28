import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { TradeEvaluation, TechnicalIndicators } from '../types'

const { mockGetPatternLibrary, mockGetTradeEvaluations } = vi.hoisted(() => ({
  mockGetPatternLibrary: vi.fn(),
  mockGetTradeEvaluations: vi.fn(),
}))

vi.mock('../db', () => ({
  saveOpenPositionContext: vi.fn(),
  getOpenPositionContexts: vi.fn(),
  deleteOpenPositionContext: vi.fn(),
  insertTradeEvaluation: vi.fn(),
  getTradeEvaluations: mockGetTradeEvaluations,
  getPatternLibrary: mockGetPatternLibrary,
  upsertPattern: vi.fn(),
}))

import { buildLearningContext } from '../learning'

type StateFingerprint = NonNullable<TradeEvaluation['stateFingerprint']>

function makeFingerprint(overrides: Partial<StateFingerprint>): StateFingerprint {
  return {
    signal_type: 'TREND_ZLE05',
    spx_regime: 'BULL',
    market_regime: 'TRANSITION',
    adx_bucket: 'MID',
    z_bucket: 'CONTINUATION',
    macd_bucket: 'POSITIVE',
    ...overrides,
  }
}

const INDICATORS: TechnicalIndicators = {
  rsi: 50,
  macd: { macdLine: 0, signalLine: 0, histogram: 0 },
  bollingerBands: { upper: 0, middle: 0, lower: 0, percentB: 0.5 },
  sma50: 100,
  sma200: 90,
  ema50: 100,
  ema200: 90,
  distanceToEma50Pct: 0,
  kalman: null,
  currentPrice: 100,
  volume: 0,
  prevDayVolume: 0,
  adx: 20,
  atr: 1,
  atrPercentile: 0.5,
  marketRegime: 'TRANSITION',
}

function makeEvaluation(overrides: Partial<TradeEvaluation>): TradeEvaluation {
  return {
    id: 'eval_test',
    symbol: 'TEST',
    buyTimestamp: '2026-07-14T14:25:01.627Z',
    sellTimestamp: '2026-07-14T15:09:02.857Z',
    buyPrice: 100,
    sellPrice: 101,
    quantity: 10,
    pnlUSD: 10,
    pnlPct: 1,
    holdingDays: 0,
    buyIndicators: INDICATORS,
    claudePostMortem: 'test post-mortem',
    lessonsLearned: ['Test lesson'],
    outcome: 'profit',
    stateFingerprint: makeFingerprint({}),
    ...overrides,
  }
}

beforeEach(() => {
  mockGetPatternLibrary.mockReset()
  mockGetTradeEvaluations.mockReset()
  mockGetPatternLibrary.mockResolvedValue([])
})

describe('buildLearningContext() — gate-aware relevance comparison', () => {
  it('renders a comparison line with correct differ/match annotations (NOK/NFLX-shaped case)', async () => {
    // Arrange
    const currentFingerprint = makeFingerprint({
      signal_type: 'MEAN_REVERSION',
      market_regime: 'RANGING',
      adx_bucket: 'LOW',
      z_bucket: 'DEEP',
      macd_bucket: 'POSITIVE',
    })
    const nokFingerprint = makeFingerprint({
      signal_type: 'TREND_ZLE05',
      market_regime: 'RANGING',
      adx_bucket: 'LOW',
      z_bucket: 'CONTINUATION',
      macd_bucket: 'DEEP_NEGATIVE',
    })
    mockGetTradeEvaluations.mockResolvedValue([
      makeEvaluation({ symbol: 'NOK', outcome: 'loss', pnlPct: -5.9, stateFingerprint: nokFingerprint }),
    ])

    // Act
    const context = await buildLearningContext(INDICATORS, currentFingerprint)

    // Assert
    expect(context).toContain('Context vs. current trade:')
    expect(context).toContain('MACD differs (yours: POSITIVE [not-gated for MEAN_REVERSION] · NOK\'s: DEEP_NEGATIVE [hard-gated for TREND_ZLE05])')
    expect(context).toContain('ADX matches (both LOW)')
    expect(context).toContain('Regime matches (both RANGING)')
    expect(context).toContain(
      'Note: differences in dimensions that are not gated for either setup are generally less informative than differences in dimensions that are hard-gated for one or both setups.'
    )
  })

  it('produces byte-identical output to the single-argument call when currentFingerprint defaults to null', async () => {
    // Arrange
    mockGetTradeEvaluations.mockResolvedValue([makeEvaluation({})])

    // Act
    const withDefault = await buildLearningContext(INDICATORS)
    const withExplicitNull = await buildLearningContext(INDICATORS, null)

    // Assert
    expect(withDefault).toBe(withExplicitNull)
    expect(withDefault).not.toContain('Context vs. current trade:')
    expect(withDefault).not.toContain('Note: differences in dimensions')
  })

  it('falls back to the unlabeled format for one entry when its stateFingerprint is null, without affecting other entries', async () => {
    // Arrange
    const currentFingerprint = makeFingerprint({})
    mockGetTradeEvaluations.mockResolvedValue([
      makeEvaluation({ symbol: 'NOFP', stateFingerprint: null }),
      makeEvaluation({ symbol: 'HASFP', stateFingerprint: makeFingerprint({}) }),
    ])

    // Act
    const context = await buildLearningContext(INDICATORS, currentFingerprint)
    const lines = context.split('\n')
    const nofpIndex = lines.findIndex((l) => l.includes('- NOFP'))
    const hasfpIndex = lines.findIndex((l) => l.includes('- HASFP'))

    // Assert
    expect(lines[nofpIndex + 1]).not.toContain('Context vs. current trade:')
    expect(lines[hasfpIndex + 1]).toContain('Context vs. current trade:')
  })

  it('falls back to the unlabeled format when signal_type is not a DIMENSION_IMPORTANCE key (legacy TREND)', async () => {
    // Arrange
    const currentFingerprint = makeFingerprint({})
    mockGetTradeEvaluations.mockResolvedValue([
      makeEvaluation({
        symbol: 'LEGACY',
        stateFingerprint: makeFingerprint({ signal_type: 'TREND' as unknown as StateFingerprint['signal_type'] }),
      }),
    ])

    // Act
    const context = await buildLearningContext(INDICATORS, currentFingerprint)

    // Assert
    expect(context).not.toContain('Context vs. current trade:')
    expect(context).not.toContain('Note: differences in dimensions')
  })

  it('omits an individual dimension when either side is null, while still comparing the other dimensions', async () => {
    // Arrange — EMA_RECLAIM: getZBucket() always returns null for this signal type in production
    const currentFingerprint = makeFingerprint({
      signal_type: 'EMA_RECLAIM',
      market_regime: 'TRENDING',
      adx_bucket: 'HIGH',
      macd_bucket: 'POSITIVE',
      z_bucket: null,
    })
    const historicalFingerprint = makeFingerprint({
      signal_type: 'EMA_RECLAIM',
      market_regime: 'TRENDING',
      adx_bucket: 'LOW',
      macd_bucket: 'NEGATIVE',
      z_bucket: null,
    })
    mockGetTradeEvaluations.mockResolvedValue([
      makeEvaluation({ symbol: 'RECL', stateFingerprint: historicalFingerprint }),
    ])

    // Act
    const context = await buildLearningContext(INDICATORS, currentFingerprint)

    // Assert
    expect(context).toContain('ADX differs')
    expect(context).toContain('MACD differs')
    expect(context).toContain('Regime matches (both TRENDING)')
    expect(context).not.toMatch(/Z (matches|differs)/)
  })

  it('appends the interpretive note exactly once when multiple comparison lines render', async () => {
    // Arrange
    const currentFingerprint = makeFingerprint({ macd_bucket: 'POSITIVE' })
    mockGetTradeEvaluations.mockResolvedValue([
      makeEvaluation({ symbol: 'A', stateFingerprint: makeFingerprint({ macd_bucket: 'NEGATIVE' }) }),
      makeEvaluation({ symbol: 'B', stateFingerprint: makeFingerprint({ macd_bucket: 'DEEP_NEGATIVE' }) }),
    ])

    // Act
    const context = await buildLearningContext(INDICATORS, currentFingerprint)
    const noteOccurrences = context.split('Note: differences in dimensions').length - 1

    // Assert
    expect(noteOccurrences).toBe(1)
  })

  it('omits the interpretive note entirely when zero comparison lines render', async () => {
    // Arrange
    mockGetTradeEvaluations.mockResolvedValue([makeEvaluation({ stateFingerprint: null })])

    // Act
    const context = await buildLearningContext(INDICATORS, makeFingerprint({}))

    // Assert
    expect(context).not.toContain('Note: differences in dimensions')
  })

  it('compares "Regime" using market_regime, not spx_regime — matches despite differing spx_regime', async () => {
    // Arrange — market_regime equal on both sides, spx_regime deliberately
    // different, so this would fail if the comparison ever read spx_regime
    const currentFingerprint = makeFingerprint({ market_regime: 'RANGING', spx_regime: 'BULL' })
    const historicalFingerprint = makeFingerprint({ market_regime: 'RANGING', spx_regime: 'BEAR' })
    mockGetTradeEvaluations.mockResolvedValue([
      makeEvaluation({ symbol: 'REGIME', stateFingerprint: historicalFingerprint }),
    ])

    // Act
    const context = await buildLearningContext(INDICATORS, currentFingerprint)

    // Assert
    expect(context).toContain('Regime matches (both RANGING)')
  })
})
