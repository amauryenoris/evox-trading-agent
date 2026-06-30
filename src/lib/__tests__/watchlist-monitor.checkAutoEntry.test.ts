import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { NearMissEntry, TechnicalIndicators, ThresholdMap } from '../types'

const { mockGetActiveNearMisses, mockUpdateNearMiss } = vi.hoisted(() => ({
  mockGetActiveNearMisses: vi.fn(),
  mockUpdateNearMiss: vi.fn(),
}))

vi.mock('../db', () => ({
  insertNearMiss: vi.fn(),
  getActiveNearMisses: mockGetActiveNearMisses,
  updateNearMiss: mockUpdateNearMiss,
  getActiveNearMissForSymbol: vi.fn(),
  cleanupExpiredNearMisses: vi.fn(),
  cancelRevertedNearMisses: vi.fn(),
  cancelRevertedMRNearMisses: vi.fn(),
}))

import { checkAutoEntry } from '../watchlist-monitor'

function makeEntry(overrides: Partial<NearMissEntry>): NearMissEntry {
  return {
    id: 'entry-1',
    symbol: 'TEST',
    detected_at: '2026-06-26T17:59:15.156Z',
    initial_zscore: -1.3,
    gap_to_threshold: 0,
    initial_regime: 'RANGING',
    indicators_snapshot: {},
    status: 'ACTIVE',
    signal_type: 'MEAN_REVERSION',
    near_miss_type: 'NEAR_MISS',
    blocked_reason: null,
    latest_zscore: -1.3,
    latest_regime: 'RANGING',
    news_boost_applied: 0,
    effective_threshold: -1.22,
    monitoring_cycles: 4,
    expires_at: '2026-07-01T17:59:15.127Z',
    ...overrides,
  }
}

function makeIndicators(overrides: Partial<TechnicalIndicators>): TechnicalIndicators {
  return {
    rsi: 40,
    macd: { macdLine: -1, signalLine: -0.5, histogram: -0.5 },
    bollingerBands: { upper: 220, middle: 200, lower: 180, percentB: 0.2 },
    sma50: 200,
    sma200: 190,
    ema50: 200,
    ema200: 190,
    distanceToEma50Pct: -1,
    kalman: {
      stateEstimate: 200,
      forecastError: -5,
      errorStdDev: 5,
      zScore: -1.429,
      signal: 'MEAN_REVERSION_LONG',
    },
    currentPrice: 194.26,
    volume: 1_000_000,
    prevDayVolume: 1_000_000,
    adx: 17.17,
    atr: 5,
    atrPercentile: 0.5,
    marketRegime: 'RANGING',
    ...overrides,
  }
}

const threshold: ThresholdMap = { __MACRO__: 0, TEST: -1.22 }

describe('checkAutoEntry — MR_RANGING_ADX_GATE + null signal_type exclusion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateNearMiss.mockResolvedValue(undefined)
  })

  it('replays the NVDA incident: signal_type=null, RANGING, z=-1.429, adx=17.17 — excluded from readyForEntry', async () => {
    // Arrange
    mockGetActiveNearMisses.mockResolvedValue([
      makeEntry({ symbol: 'NVDA', signal_type: null }),
    ])
    const currentIndicators = {
      NVDA: makeIndicators({ adx: 17.17, marketRegime: 'RANGING' }),
    }

    // Act
    const result = await checkAutoEntry({ __MACRO__: 0, NVDA: -1.22 }, currentIndicators, 1, 5)

    // Assert
    expect(result).not.toContain('NVDA')
    expect(mockUpdateNearMiss).not.toHaveBeenCalled()
  })

  it('blocks MEAN_REVERSION in RANGING with ADX=17.9 (just under the floor)', async () => {
    // Arrange
    mockGetActiveNearMisses.mockResolvedValue([makeEntry({ symbol: 'TEST' })])
    const currentIndicators = { TEST: makeIndicators({ adx: 17.9, marketRegime: 'RANGING' }) }

    // Act
    const result = await checkAutoEntry(threshold, currentIndicators, 1, 5)

    // Assert
    expect(result).not.toContain('TEST')
  })

  it('does not block MEAN_REVERSION in RANGING with ADX=18.5 (just over the floor)', async () => {
    // Arrange
    mockGetActiveNearMisses.mockResolvedValue([makeEntry({ symbol: 'TEST' })])
    const currentIndicators = { TEST: makeIndicators({ adx: 18.5, marketRegime: 'RANGING' }) }

    // Act
    const result = await checkAutoEntry(threshold, currentIndicators, 1, 5)

    // Assert
    expect(result).toContain('TEST')
  })

  it('does not fire MR_RANGING_ADX_GATE for MEAN_REVERSION in TRANSITION (not RANGING) — covers the live COP scenario', async () => {
    // Arrange — the pre-existing regimeOk check already requires RANGING for MEAN_REVERSION
    // (untouched per C-03), so COP stays excluded from readyForEntry either way; this test
    // confirms the NEW mrRangingAdxBlocked check is not what's responsible for excluding it —
    // it stays scoped to RANGING only, same as the gate it mirrors.
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    mockGetActiveNearMisses.mockResolvedValue([makeEntry({ symbol: 'COP', latest_regime: 'TRANSITION' })])
    const currentIndicators = { COP: makeIndicators({ adx: 10, marketRegime: 'TRANSITION' }) }

    // Act
    const result = await checkAutoEntry({ __MACRO__: 0, COP: -1.22 }, currentIndicators, 1, 5)

    // Assert
    expect(result).not.toContain('COP')
    expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining('MR_RANGING_ADX_GATE'))
    logSpy.mockRestore()
  })

  it('does not block TREND_PULLBACK in RANGING with low ADX — out of scope for this fix', async () => {
    // Arrange
    mockGetActiveNearMisses.mockResolvedValue([
      makeEntry({ symbol: 'TEST', signal_type: 'TREND_PULLBACK' }),
    ])
    const currentIndicators = { TEST: makeIndicators({ adx: 10, marketRegime: 'RANGING' }) }

    // Act
    const result = await checkAutoEntry(threshold, currentIndicators, 1, 5)

    // Assert
    expect(result).toContain('TEST')
  })

  it('logs the MR_RANGING_ADX_GATE skip message in the exact spec format', async () => {
    // Arrange
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    mockGetActiveNearMisses.mockResolvedValue([makeEntry({ symbol: 'TEST' })])
    const currentIndicators = { TEST: makeIndicators({ adx: 17.9, marketRegime: 'RANGING' }) }

    // Act
    await checkAutoEntry(threshold, currentIndicators, 1, 5)

    // Assert
    expect(logSpy).toHaveBeenCalledWith(
      '[AUTO-ENTRY] TEST: skipped — MR_RANGING_ADX_GATE (ADX=17.9 < 18, regime=RANGING)'
    )
    logSpy.mockRestore()
  })

  it('logs the null signal_type skip message in the exact spec format', async () => {
    // Arrange
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    mockGetActiveNearMisses.mockResolvedValue([makeEntry({ symbol: 'NVDA', signal_type: null })])
    const currentIndicators = { NVDA: makeIndicators({ adx: 17.17, marketRegime: 'RANGING' }) }

    // Act
    await checkAutoEntry({ __MACRO__: 0, NVDA: -1.22 }, currentIndicators, 1, 5)

    // Assert
    expect(logSpy).toHaveBeenCalledWith(
      '[AUTO-ENTRY] NVDA: skipped — signal_type is null, no named setup'
    )
    logSpy.mockRestore()
  })
})
