import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { TechnicalIndicators } from '../types'

const { mockNextTradingDay, mockFreshness, mockNextReport } = vi.hoisted(() => ({
  mockNextTradingDay: vi.fn(),
  mockFreshness: vi.fn(),
  mockNextReport: vi.fn(),
}))

vi.mock('../alpaca', () => ({ getNextTradingDay: mockNextTradingDay }))
vi.mock('../db-earnings', () => ({
  getEarningsCacheFreshness: mockFreshness,
  getNextEarningsReport: mockNextReport,
}))

import { createEarningsCycleContext, buildEarningsBlockEntry } from '../earnings-gate-context'

// Tue 2026-10-27 15:00 UTC = 11:00 ET
const NOW = new Date('2026-10-27T15:00:00Z')
const TRADING_DAYS = ['2026-10-28', '2026-10-29', '2026-10-30', '2026-11-02', '2026-11-03']

describe('createEarningsCycleContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNextTradingDay.mockImplementation(async (_from: Date, k: number) => new Date(`${TRADING_DAYS[k - 1]}T00:00:00Z`))
    mockFreshness.mockResolvedValue('2026-10-27T11:17:00+00:00')
    mockNextReport.mockResolvedValue({ reportDate: '2026-10-28', session: 'AMC' })
  })

  it('blocks a symbol that reports the next trading day', async () => {
    const flag = await createEarningsCycleContext(NOW).evaluate('GOOGL')

    expect(mockNextReport).toHaveBeenCalledWith('GOOGL', '2026-10-27')
    expect(flag).toMatchObject({ blocked: true, status: 'OK', nextReportDate: '2026-10-28', tradingDaysAway: 1, session: 'AMC' })
  })

  it('loads the calendar and the freshness once per cycle for many symbols', async () => {
    const ctx = createEarningsCycleContext(NOW)
    await ctx.evaluate('A')
    await ctx.evaluate('B')

    expect(mockNextTradingDay).toHaveBeenCalledTimes(5)
    expect(mockFreshness).toHaveBeenCalledTimes(1)
    expect(mockNextReport).toHaveBeenCalledTimes(2)
  })

  it('does not block and warns once when the freshness read fails', async () => {
    mockFreshness.mockRejectedValue(new Error('db down'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const ctx = createEarningsCycleContext(NOW)

    const first = await ctx.evaluate('A')
    const second = await ctx.evaluate('B')

    expect(first).toMatchObject({ blocked: false, status: 'UNKNOWN' })
    expect(second).toMatchObject({ blocked: false, status: 'UNKNOWN' })
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })

  it('does not block when the symbol read fails', async () => {
    mockNextReport.mockRejectedValue(new Error('read failed'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const flag = await createEarningsCycleContext(NOW).evaluate('A')

    expect(flag).toMatchObject({ blocked: false, status: 'UNKNOWN' })
    warn.mockRestore()
  })

  it('reports STALE and warns once for an old cache', async () => {
    mockFreshness.mockResolvedValue('2026-10-20T11:17:00+00:00')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const ctx = createEarningsCycleContext(NOW)

    expect(await ctx.evaluate('A')).toMatchObject({ blocked: false, status: 'STALE' })
    await ctx.evaluate('B')
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })

  it('falls back to weekdays when the calendar returns weekend dates', async () => {
    // Friday 2026-10-30 15:00 UTC; calendar fallback returned +k calendar days
    const friday = new Date('2026-10-30T15:00:00Z')
    mockNextTradingDay.mockImplementation(async (_from: Date, k: number) => new Date(Date.UTC(2026, 9, 30 + k)))
    mockFreshness.mockResolvedValue('2026-10-30T11:17:00+00:00')
    mockNextReport.mockResolvedValue({ reportDate: '2026-11-02', session: 'BMO' })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const flag = await createEarningsCycleContext(friday).evaluate('A')

    expect(flag).toMatchObject({ blocked: true, tradingDaysAway: 1 })
    warn.mockRestore()
  })

  it('uses the weekday rule when the calendar lookup throws', async () => {
    mockNextTradingDay.mockRejectedValue(new Error('calendar'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const flag = await createEarningsCycleContext(NOW).evaluate('A')

    expect(flag).toMatchObject({ blocked: true, tradingDaysAway: 1 })
    warn.mockRestore()
  })
})

describe('buildEarningsBlockEntry', () => {
  const indicators = { currentPrice: 100, rsi: 40 } as TechnicalIndicators

  it('builds a HOLD record with the EARNINGS_BLOCK prefix and full indicators', () => {
    const entry = buildEarningsBlockEntry({
      symbol: 'GOOGL',
      timestamp: '2026-10-27T15:00:00.000Z',
      indicators,
      account: { equity: '100000', cash: '50000' },
      positionCount: 3,
      reason: 'EARNINGS_BLOCK: GOOGL reports 2026-10-28 (after close)',
    })

    expect(entry.error).toBe('EARNINGS_BLOCK: GOOGL reports 2026-10-28 (after close)')
    expect(entry.decision).toEqual({ action: 'HOLD', symbol: 'GOOGL', quantity: 0, reasoning: entry.error, confidence: 0 })
    expect(entry.orderExecuted).toBe(false)
    expect(entry.indicators).toBe(indicators)
    expect(entry.portfolioSnapshot).toEqual({ equity: '100000', cash: '50000', positionCount: 3 })
    expect(entry.id).toMatch(/[0-9a-f-]{36}/)
  })
})
