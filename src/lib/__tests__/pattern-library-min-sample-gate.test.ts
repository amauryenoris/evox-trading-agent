import { describe, it, expect, vi } from 'vitest'
import type { TradingPattern, TechnicalIndicators } from '../types'

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

import { getRelevantPatterns, buildLearningContext, MIN_PATTERN_SAMPLE_SIZE } from '../learning'

function makePattern(overrides: Partial<TradingPattern>): TradingPattern {
  return {
    id: 'pat_test',
    createdAt: '2026-07-20T00:00:00.000Z',
    updatedAt: '2026-07-20T00:00:00.000Z',
    description: 'Test pattern description',
    conditions: {},
    action: 'BUY',
    sampleCount: 1,
    winCount: 1,
    avgPnLPct: 0,
    winRate: 1,
    exampleReasoning: '',
    signalType: 'TREND_ZLE05',
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
  marketRegime: 'TRENDING',
}

describe('MIN_PATTERN_SAMPLE_SIZE constant', () => {
  it('is set to 5', () => {
    expect(MIN_PATTERN_SAMPLE_SIZE).toBe(5)
  })
})

describe('getRelevantPatterns() — excludes sub-threshold patterns', () => {
  it('excludes a pattern with sampleCount=4', async () => {
    // Arrange
    mockGetPatternLibrary.mockResolvedValue([
      makePattern({ id: 'pat_below', sampleCount: 4, winRate: 1 }),
    ])

    // Act
    const result = await getRelevantPatterns(INDICATORS, 5)

    // Assert
    expect(result.find((p) => p.id === 'pat_below')).toBeUndefined()
  })

  it('includes a pattern with sampleCount=5', async () => {
    // Arrange
    mockGetPatternLibrary.mockResolvedValue([
      makePattern({ id: 'pat_at_threshold', sampleCount: 5, winRate: 0.8 }),
    ])

    // Act
    const result = await getRelevantPatterns(INDICATORS, 5)

    // Assert
    expect(result.find((p) => p.id === 'pat_at_threshold')).toBeDefined()
  })

  it('excludes the current CVX/TREND_ZLE05-shaped pattern (sampleCount=1, winRate=1)', async () => {
    // Arrange — mirrors the live row that prompted this fix
    mockGetPatternLibrary.mockResolvedValue([
      makePattern({
        id: 'pat_1784569060842_CVX',
        sampleCount: 1,
        winCount: 1,
        winRate: 1,
        avgPnLPct: 3.29,
        signalType: 'TREND_ZLE05',
      }),
    ])

    // Act
    const result = await getRelevantPatterns(INDICATORS, 5)

    // Assert
    expect(result).toHaveLength(0)
  })
})

describe('buildLearningContext() — sub-threshold patterns never reach Claude\'s prompt text', () => {
  it('omits a sampleCount=1 pattern from the formatted output entirely', async () => {
    // Arrange
    mockGetPatternLibrary.mockResolvedValue([
      makePattern({ id: 'pat_low', description: 'UNIQUE_LOW_SAMPLE_MARKER', sampleCount: 1 }),
    ])
    mockGetTradeEvaluations.mockResolvedValue([])

    // Act
    const context = await buildLearningContext(INDICATORS)

    // Assert
    expect(context).not.toContain('UNIQUE_LOW_SAMPLE_MARKER')
    expect(context).not.toContain('PATTERNS WITH BEST PERFORMANCE')
  })

  it('includes a sampleCount=5 pattern in the formatted output, unchanged format', async () => {
    // Arrange
    mockGetPatternLibrary.mockResolvedValue([
      makePattern({
        id: 'pat_high',
        description: 'UNIQUE_HIGH_SAMPLE_MARKER',
        sampleCount: 5,
        winRate: 0.8,
        avgPnLPct: 2.5,
      }),
    ])
    mockGetTradeEvaluations.mockResolvedValue([])

    // Act
    const context = await buildLearningContext(INDICATORS)

    // Assert
    expect(context).toContain('UNIQUE_HIGH_SAMPLE_MARKER')
    expect(context).toContain('Win rate: 80%')
    expect(context).toContain('5 trades')
  })
})

describe('dashboard render boundary — mirrors PatternLibraryCard.tsx\'s hasEnoughSamples check', () => {
  it('sampleCount=4 does not meet the threshold (renders insufficient-data badge)', () => {
    expect(4 >= MIN_PATTERN_SAMPLE_SIZE).toBe(false)
  })

  it('sampleCount=5 meets the threshold (renders win-rate bar)', () => {
    expect(5 >= MIN_PATTERN_SAMPLE_SIZE).toBe(true)
  })
})

describe('PDF report boundary — mirrors report-generator.ts\'s topPatterns filter', () => {
  it('sampleCount=4 is excluded from topPatterns', () => {
    const patterns = [makePattern({ id: 'p4', sampleCount: 4 })]
    const topPatterns = patterns.filter((p) => p.sampleCount >= MIN_PATTERN_SAMPLE_SIZE)
    expect(topPatterns).toHaveLength(0)
  })

  it('sampleCount=5 is included in topPatterns', () => {
    const patterns = [makePattern({ id: 'p5', sampleCount: 5 })]
    const topPatterns = patterns.filter((p) => p.sampleCount >= MIN_PATTERN_SAMPLE_SIZE)
    expect(topPatterns).toHaveLength(1)
  })
})
