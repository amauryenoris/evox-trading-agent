import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { TradeEvaluation, TradingPattern, TechnicalIndicators } from '../types'

const { mockGetPatternLibrary, mockUpsertPattern } = vi.hoisted(() => ({
  mockGetPatternLibrary: vi.fn(),
  mockUpsertPattern: vi.fn(),
}))

vi.mock('../db', () => ({
  saveOpenPositionContext: vi.fn(),
  getOpenPositionContexts: vi.fn(),
  deleteOpenPositionContext: vi.fn(),
  insertTradeEvaluation: vi.fn(),
  getTradeEvaluations: vi.fn(),
  getPatternLibrary: mockGetPatternLibrary,
  upsertPattern: mockUpsertPattern,
}))

import { buildPatternKey, updatePatternLibrary } from '../learning'

type StateFingerprint = TradeEvaluation['stateFingerprint']

function makeFingerprint(overrides: Partial<NonNullable<StateFingerprint>>): NonNullable<StateFingerprint> {
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

const BUY_INDICATORS: TechnicalIndicators = {
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
    buyIndicators: BUY_INDICATORS,
    claudePostMortem: 'test post-mortem',
    lessonsLearned: [],
    outcome: 'profit',
    stateFingerprint: makeFingerprint({}),
    ...overrides,
  }
}

function makePattern(overrides: Partial<TradingPattern>): TradingPattern {
  return {
    id: 'pat_existing',
    createdAt: '2026-07-13T00:00:00.000Z',
    updatedAt: '2026-07-13T00:00:00.000Z',
    description: 'Existing pattern prose',
    conditions: {},
    action: 'BUY',
    sampleCount: 1,
    winCount: 1,
    avgPnLPct: 2,
    winRate: 1,
    exampleReasoning: '',
    signalType: 'TREND_ZLE05',
    patternKey: 'TREND_ZLE05|CONTINUATION|MID|POSITIVE',
    ...overrides,
  }
}

describe('buildPatternKey()', () => {
  it('returns null when the fingerprint is null', () => {
    expect(buildPatternKey(null)).toBeNull()
  })

  it('returns a deterministic, stable string for the same fingerprint', () => {
    const fp = makeFingerprint({})
    const key1 = buildPatternKey(fp)
    const key2 = buildPatternKey(fp)
    expect(key1).toBe(key2)
    expect(key1).toBe('TREND_ZLE05|CONTINUATION|MID|POSITIVE')
  })
})

describe('updatePatternLibrary() — key-based matching', () => {
  beforeEach(() => {
    mockGetPatternLibrary.mockReset()
    mockUpsertPattern.mockReset()
  })

  it('merges into an existing row when the derived key matches', async () => {
    // Arrange
    mockGetPatternLibrary.mockResolvedValue([makePattern({ sampleCount: 3, winCount: 2 })])
    const evaluation = makeEvaluation({ stateFingerprint: makeFingerprint({}) })

    // Act
    await updatePatternLibrary(evaluation, 'A completely different description this time', {})

    // Assert
    expect(mockUpsertPattern).toHaveBeenCalledTimes(1)
    const saved = mockUpsertPattern.mock.calls[0][0] as TradingPattern
    expect(saved.id).toBe('pat_existing')
    expect(saved.sampleCount).toBe(4)
    expect(saved.winCount).toBe(3)
  })

  it('creates a new row when the derived key differs from any existing row', async () => {
    // Arrange
    mockGetPatternLibrary.mockResolvedValue([makePattern({ patternKey: 'MEAN_REVERSION|DEEP|LOW|NEGATIVE' })])
    const evaluation = makeEvaluation({ stateFingerprint: makeFingerprint({}) })

    // Act
    await updatePatternLibrary(evaluation, 'New pattern description', {})

    // Assert
    const saved = mockUpsertPattern.mock.calls[0][0] as TradingPattern
    expect(saved.sampleCount).toBe(1)
    expect(saved.patternKey).toBe('TREND_ZLE05|CONTINUATION|MID|POSITIVE')
  })

  it('never matches when stateFingerprint is null, even against an existing row with patternKey=null', async () => {
    // Arrange
    mockGetPatternLibrary.mockResolvedValue([makePattern({ patternKey: null, sampleCount: 7 })])
    const evaluation = makeEvaluation({ stateFingerprint: null })

    // Act
    await updatePatternLibrary(evaluation, 'Some description', {})

    // Assert — always creates a new row, never merges into the null-keyed existing row
    const saved = mockUpsertPattern.mock.calls[0][0] as TradingPattern
    expect(saved.sampleCount).toBe(1)
    expect(saved.patternKey).toBeNull()
  })

  it('description is no longer used for matching — different description, same key, still merges', async () => {
    // Arrange
    mockGetPatternLibrary.mockResolvedValue([
      makePattern({ description: 'Totally unrelated prose from a different Claude call' }),
    ])
    const evaluation = makeEvaluation({ stateFingerprint: makeFingerprint({}) })

    // Act
    await updatePatternLibrary(evaluation, 'Yet another unrelated description', {})

    // Assert
    const saved = mockUpsertPattern.mock.calls[0][0] as TradingPattern
    expect(saved.sampleCount).toBe(2)
  })
})

describe('T-14 regression — real XOM trades from the diagnostic, actual result reported', () => {
  it('XOM 2026-07-13 and 2026-07-14 (both CONTINUATION/MID/POSITIVE) produce the SAME key', () => {
    // Arrange — real stateFingerprints pulled live from trade_evaluations
    const xom0713 = makeFingerprint({ z_bucket: 'CONTINUATION', adx_bucket: 'MID', macd_bucket: 'POSITIVE' })
    const xom0714 = makeFingerprint({ z_bucket: 'CONTINUATION', adx_bucket: 'MID', macd_bucket: 'POSITIVE' })

    // Act
    const key0713 = buildPatternKey(xom0713)
    const key0714 = buildPatternKey(xom0714)

    // Assert
    expect(key0713).toBe(key0714)
  })

  it('XOM 2026-07-14 (CONTINUATION) and 2026-07-14→15 (CHOP) produce DIFFERENT keys — the diagnostic\'s assumed match does not hold', () => {
    // Arrange — real stateFingerprints: the two trades the diagnostic flagged as "functionally
    // identical" actually straddle the z_bucket CONTINUATION/CHOP boundary (z=1.114 vs z=0.995)
    const xom0714 = makeFingerprint({ z_bucket: 'CONTINUATION', adx_bucket: 'MID', macd_bucket: 'POSITIVE' })
    const xom0714to15 = makeFingerprint({ z_bucket: 'CHOP', adx_bucket: 'MID', macd_bucket: 'POSITIVE' })

    // Act
    const key0714 = buildPatternKey(xom0714)
    const key0714to15 = buildPatternKey(xom0714to15)

    // Assert — reporting the actual result: they do NOT match under this key scheme
    expect(key0714).not.toBe(key0714to15)
    expect(key0714).toBe('TREND_ZLE05|CONTINUATION|MID|POSITIVE')
    expect(key0714to15).toBe('TREND_ZLE05|CHOP|MID|POSITIVE')
  })
})
