import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getMarketDailyBriefingByDate, upsertMarketDailyBriefing } from '../db-market-briefing'

const { mockFrom, mockSelect, mockEq, mockMaybeSingle, mockUpsert } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockSelect: vi.fn(),
  mockEq: vi.fn(),
  mockMaybeSingle: vi.fn(),
  mockUpsert: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: mockFrom }),
}))

describe('getMarketDailyBriefingByDate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEq.mockReturnValue({ maybeSingle: mockMaybeSingle })
    mockSelect.mockReturnValue({ eq: mockEq })
    mockFrom.mockReturnValue({ select: mockSelect })
  })

  it('queries by briefing_date and returns the row when found', async () => {
    // Arrange
    const row = { id: '1', briefing_date: '2026-08-20', narrative: 'Markets steady.' }
    mockMaybeSingle.mockResolvedValue({ data: row, error: null })

    // Act
    const result = await getMarketDailyBriefingByDate('2026-08-20')

    // Assert
    expect(mockFrom).toHaveBeenCalledWith('market_daily_briefings')
    expect(mockSelect).toHaveBeenCalledWith('*')
    expect(mockEq).toHaveBeenCalledWith('briefing_date', '2026-08-20')
    expect(result).toEqual(row)
  })

  it('returns null when no row exists for the date', async () => {
    // Arrange
    mockMaybeSingle.mockResolvedValue({ data: null, error: null })

    // Act
    const result = await getMarketDailyBriefingByDate('2026-08-20')

    // Assert
    expect(result).toBeNull()
  })

  it('throws on a Supabase error', async () => {
    // Arrange
    mockMaybeSingle.mockResolvedValue({ data: null, error: { message: 'connection lost' } })

    // Act + Assert
    await expect(getMarketDailyBriefingByDate('2026-08-20')).rejects.toThrow(
      'Failed to fetch market daily briefing: connection lost'
    )
  })
})

describe('upsertMarketDailyBriefing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFrom.mockReturnValue({ upsert: mockUpsert })
  })

  const record = {
    briefing_date: '2026-08-20',
    spx_price: 5800,
    spx_sma50: 5700,
    spx_sma200: 5500,
    spx_regime: 'BULL',
    gdx_relative_strength_pct: 1,
    xle_relative_strength_pct: 1,
    xlk_relative_strength_pct: 1,
    macro_sentiment_bullish_count: 1,
    macro_sentiment_bearish_count: 0,
    macro_sentiment_neutral_count: 0,
    narrative: 'Markets steady.',
    vix_proxy_change: null,
    upcoming_events_note: null,
  }

  it('upserts on briefing_date and resolves when successful', async () => {
    // Arrange
    mockUpsert.mockResolvedValue({ error: null })

    // Act + Assert (no throw)
    await expect(upsertMarketDailyBriefing(record)).resolves.toBeUndefined()

    expect(mockFrom).toHaveBeenCalledWith('market_daily_briefings')
    expect(mockUpsert).toHaveBeenCalledWith(record, { onConflict: 'briefing_date' })
  })

  it('throws on a Supabase error', async () => {
    // Arrange
    mockUpsert.mockResolvedValue({ error: { message: 'constraint violation' } })

    // Act + Assert
    await expect(upsertMarketDailyBriefing(record)).rejects.toThrow(
      'Failed to upsert market daily briefing: constraint violation'
    )
  })
})
