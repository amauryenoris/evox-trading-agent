import { describe, it, expect, vi } from 'vitest'
import type { SpxSnapshot } from '../market-daily-briefing'
import type { SectorRotationSnapshot } from '../sector-rotation'
import type { MacroSentimentSummary } from '../news-intelligence'
import type { MarketDailyBriefing } from '../types'

const { mockGetMarketDailyBriefingByDate, mockUpsertMarketDailyBriefing } = vi.hoisted(() => ({
  mockGetMarketDailyBriefingByDate: vi.fn(),
  mockUpsertMarketDailyBriefing: vi.fn(),
}))

vi.mock('../db-market-briefing', () => ({
  getMarketDailyBriefingByDate: mockGetMarketDailyBriefingByDate,
  upsertMarketDailyBriefing: mockUpsertMarketDailyBriefing,
}))

import {
  generateDailyBriefing,
  buildBriefingRecord,
  formatSpxSnapshotContext,
  formatSectorRotationSnapshot,
  formatMacroSentimentSummary,
  computeVixyChangePct,
  formatVixyChangeContext,
} from '../market-daily-briefing'

const SPX_SNAPSHOT: SpxSnapshot = {
  spx_price: 5800.5,
  spx_sma50: 5700,
  spx_sma200: 5500,
  spx_regime: 'BULL',
}

const SECTOR_ROTATION: SectorRotationSnapshot = {
  gdx_relative_strength_pct: 3.25,
  xle_relative_strength_pct: -1.1,
  xlk_relative_strength_pct: 0.5,
}

const MACRO_SENTIMENT: MacroSentimentSummary = {
  bullishCount: 4,
  bearishCount: 1,
  neutralCount: 2,
}

// synthesizeDailyBriefingNarrative() makes a live Anthropic API call and is not
// exported for direct testing — its deterministic sub-logic (prompt assembly via
// formatSpxSnapshotContext/formatSectorRotationSnapshot/formatMacroSentimentSummary,
// and the payload it eventually persists via buildBriefingRecord) is tested below
// instead, per this codebase's established convention (see news-intelligence.test.ts).
describe('generateDailyBriefing — existing row branch', () => {
  it('returns the existing narrative and does not synthesize or persist a new one', async () => {
    // Arrange
    const existing: MarketDailyBriefing = {
      id: 'row-1',
      briefing_date: new Date().toISOString().split('T')[0],
      created_at: new Date().toISOString(),
      ...SPX_SNAPSHOT,
      ...SECTOR_ROTATION,
      macro_sentiment_bullish_count: MACRO_SENTIMENT.bullishCount,
      macro_sentiment_bearish_count: MACRO_SENTIMENT.bearishCount,
      macro_sentiment_neutral_count: MACRO_SENTIMENT.neutralCount,
      narrative: 'Markets remain in an uptrend with rotation into gold miners.',
      vix_proxy_change: null,
      upcoming_events_note: null,
    }
    mockGetMarketDailyBriefingByDate.mockResolvedValue(existing)

    // Act
    const result = await generateDailyBriefing(SPX_SNAPSHOT, SECTOR_ROTATION, MACRO_SENTIMENT, null)

    // Assert
    expect(result).toBe(existing.narrative)
    expect(mockUpsertMarketDailyBriefing).not.toHaveBeenCalled()
  })
})

// The 4th parameter lets the "missing row" path be exercised end-to-end through
// generateDailyBriefing() itself via a fake synthesis function, with zero Anthropic
// SDK involvement — synthesizeDailyBriefingNarrative() remains untested directly.
describe('generateDailyBriefing — missing row branch (via injected synthesis function)', () => {
  it('calls the injected synthesize function, persists the result, and returns the new narrative', async () => {
    // Arrange
    mockGetMarketDailyBriefingByDate.mockResolvedValue(null)
    mockUpsertMarketDailyBriefing.mockResolvedValue(undefined)
    const fakeNarrative = 'Fake narrative from injected synthesis function.'
    const fakeSynthesize = vi.fn().mockResolvedValue(fakeNarrative)

    // Act
    const result = await generateDailyBriefing(SPX_SNAPSHOT, SECTOR_ROTATION, MACRO_SENTIMENT, null, fakeSynthesize)

    // Assert
    expect(fakeSynthesize).toHaveBeenCalledWith(SPX_SNAPSHOT, SECTOR_ROTATION, MACRO_SENTIMENT, null)
    expect(mockUpsertMarketDailyBriefing).toHaveBeenCalledWith(
      expect.objectContaining({ narrative: fakeNarrative })
    )
    expect(result).toBe(fakeNarrative)
  })
})

describe('buildBriefingRecord', () => {
  it('maps the three inputs and narrative into the exact market_daily_briefings payload shape', () => {
    // Arrange
    const briefingDate = '2026-08-20'
    const narrative = 'SPX in an uptrend; sector rotation favors gold miners; macro sentiment tilts bullish.'

    // Act
    const record = buildBriefingRecord(briefingDate, SPX_SNAPSHOT, SECTOR_ROTATION, MACRO_SENTIMENT, narrative, -3.42)

    // Assert
    expect(record).toEqual({
      briefing_date: briefingDate,
      spx_price: 5800.5,
      spx_sma50: 5700,
      spx_sma200: 5500,
      spx_regime: 'BULL',
      gdx_relative_strength_pct: 3.25,
      xle_relative_strength_pct: -1.1,
      xlk_relative_strength_pct: 0.5,
      macro_sentiment_bullish_count: 4,
      macro_sentiment_bearish_count: 1,
      macro_sentiment_neutral_count: 2,
      narrative,
      vix_proxy_change: -3.42,
      upcoming_events_note: null,
    })
  })
})

describe('formatSpxSnapshotContext', () => {
  it('formats a populated snapshot with price, regime, and both SMAs', () => {
    // Arrange / Act
    const result = formatSpxSnapshotContext(SPX_SNAPSHOT)

    // Assert
    expect(result).toBe('SPX: $5800.50, regime=BULL, SMA50=5700.00, SMA200=5500.00')
  })

  it('returns a no-data message when price or regime is null', () => {
    // Arrange
    const emptySnapshot: SpxSnapshot = { spx_price: null, spx_sma50: null, spx_sma200: null, spx_regime: null }

    // Act
    const result = formatSpxSnapshotContext(emptySnapshot)

    // Assert
    expect(result).toBe('SPX: no data')
  })
})

describe('formatSectorRotationSnapshot', () => {
  it('formats all three sectors with sign-prefixed percentages', () => {
    // Arrange / Act
    const result = formatSectorRotationSnapshot(SECTOR_ROTATION)

    // Assert
    expect(result).toBe(
      'Gold/Mining (GDX): +3.25% vs SPY (20d)\nEnergy (XLE): -1.10% vs SPY (20d)\nTechnology (XLK): +0.50% vs SPY (20d)'
    )
  })

  it('reports no data for a null sector value', () => {
    // Arrange
    const noData: SectorRotationSnapshot = {
      gdx_relative_strength_pct: null,
      xle_relative_strength_pct: null,
      xlk_relative_strength_pct: null,
    }

    // Act
    const result = formatSectorRotationSnapshot(noData)

    // Assert
    expect(result).toBe('Gold/Mining (GDX): no data\nEnergy (XLE): no data\nTechnology (XLK): no data')
  })
})

describe('formatMacroSentimentSummary', () => {
  it('formats bullish/bearish/neutral counts', () => {
    // Arrange / Act
    const result = formatMacroSentimentSummary(MACRO_SENTIMENT)

    // Assert
    expect(result).toBe('MACRO NEWS SENTIMENT (last 12h): 4 bullish, 1 bearish, 2 neutral')
  })
})

describe('computeVixyChangePct', () => {
  it('computes the 1-day change from the confirmed close vs. the prior confirmed close', () => {
    // Arrange
    const bars = [
      { t: '2026-08-24', c: 20 },
      { t: '2026-08-25', c: 19 },
      { t: '2026-08-26', c: 20.9 },
      { t: '2026-08-27', c: 999 }, // today's still-forming bar — must be excluded
    ]

    // Act
    const result = computeVixyChangePct(bars)

    // Assert — refIndex = length-2 = index 2 (20.9), past = index 1 (19) → +10%
    expect(result).toBeCloseTo(10, 5)
  })

  it('returns null when fewer than 3 bars are supplied', () => {
    // Arrange
    const bars = [
      { t: '2026-08-26', c: 20 },
      { t: '2026-08-27', c: 21 },
    ]

    // Act
    const result = computeVixyChangePct(bars)

    // Assert
    expect(result).toBeNull()
  })

  it('returns null when the past close is zero', () => {
    // Arrange
    const bars = [
      { t: '2026-08-25', c: 0 },
      { t: '2026-08-26', c: 20 },
      { t: '2026-08-27', c: 999 },
    ]

    // Act
    const result = computeVixyChangePct(bars)

    // Assert
    expect(result).toBeNull()
  })
})

describe('formatVixyChangeContext', () => {
  it('renders a no-data message when vixyChangePct is null', () => {
    // Arrange / Act
    const result = formatVixyChangeContext(null)

    // Assert
    expect(result).toBe('VIX proxy (VIXY, directional only — not the real VIX level): no data')
  })

  it('renders a signed positive percentage with the directional-only caveat', () => {
    // Arrange / Act
    const result = formatVixyChangeContext(4.5)

    // Assert
    expect(result).toBe('VIX proxy (VIXY, directional only — not the real VIX level): +4.50% today')
  })

  it('renders a signed negative percentage with the directional-only caveat', () => {
    // Arrange / Act
    const result = formatVixyChangeContext(-2.13)

    // Assert
    expect(result).toBe('VIX proxy (VIXY, directional only — not the real VIX level): -2.13% today')
  })
})
