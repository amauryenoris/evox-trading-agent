import { describe, it, expect } from 'vitest'
import {
  EARNINGS_BLOCK,
  EARNINGS_BLOCK_TRADING_DAYS,
  isEarningsBlocked,
  countTradingDaysAway,
  buildEarningsBlockReason,
  evaluateEarningsGate,
  type EarningsGateInput,
} from '../earnings-window'

// 2026-10-26 Mon .. 2026-10-30 Fri, 2026-11-02 Mon
const UPCOMING_FROM_TUE = ['2026-10-28', '2026-10-29', '2026-10-30', '2026-11-02', '2026-11-03']

describe('isEarningsBlocked', () => {
  it('blocks when the report is on the entry date', () => {
    expect(isEarningsBlocked('2026-10-27', '2026-10-27', '2026-10-28')).toEqual({ blocked: true, reason: 'IN_WINDOW' })
  })

  it('blocks when the report is on the next trading day', () => {
    expect(isEarningsBlocked('2026-10-27', '2026-10-28', '2026-10-28').blocked).toBe(true)
  })

  it('does not block when the report is the day after the next trading day', () => {
    expect(isEarningsBlocked('2026-10-27', '2026-10-29', '2026-10-28')).toEqual({ blocked: false, reason: 'OUTSIDE_WINDOW' })
  })

  it('does not block a report that already happened', () => {
    expect(isEarningsBlocked('2026-10-27', '2026-10-26', '2026-10-28').blocked).toBe(false)
  })

  it('blocks a Friday entry with a Monday report', () => {
    expect(isEarningsBlocked('2026-10-30', '2026-11-02', '2026-11-02').blocked).toBe(true)
  })

  it('blocks across a holiday gap when the report is on the next trading day', () => {
    // Thu 2026-11-26 Thanksgiving: Wed entry, next trading day is Fri 11-27
    expect(isEarningsBlocked('2026-11-25', '2026-11-27', '2026-11-27').blocked).toBe(true)
    expect(isEarningsBlocked('2026-11-25', '2026-11-26', '2026-11-27').blocked).toBe(false)
  })

  it('records but never blocks when the window is 0 days', () => {
    expect(isEarningsBlocked('2026-10-27', '2026-10-27', '2026-10-28', 0)).toEqual({ blocked: false, reason: 'DISABLED' })
  })

  it('exports a window of 1 trading day', () => {
    expect(EARNINGS_BLOCK_TRADING_DAYS).toBe(1)
  })

  it.each([
    ['missing report', '2026-10-27', null, '2026-10-28'],
    ['undefined report', '2026-10-27', undefined, '2026-10-28'],
    ['unparseable report', '2026-10-27', 'soon', '2026-10-28'],
    ['impossible date', '2026-10-27', '2026-02-31', '2026-10-28'],
    ['missing next trading day', '2026-10-27', '2026-10-28', null],
    ['invalid entry date', 'x', '2026-10-28', '2026-10-28'],
    ['weekend next trading day', '2026-10-30', '2026-10-31', '2026-10-31'],
  ])('returns UNKNOWN and does not throw for %s', (_name, entry, report, next) => {
    expect(isEarningsBlocked(entry, report as string | null | undefined, next as string | null)).toEqual({ blocked: false, reason: 'UNKNOWN' })
  })
})

describe('buildEarningsBlockReason', () => {
  it.each([
    ['BMO', 'before open'],
    ['AMC', 'after close'],
    ['UNKNOWN', 'time not supplied'],
  ] as const)('writes the %s timing', (session, label) => {
    const reason = buildEarningsBlockReason('GOOGL', '2026-10-28', session)
    expect(reason).toBe(`EARNINGS_BLOCK: GOOGL reports 2026-10-28 (${label})`)
    expect(reason.startsWith(EARNINGS_BLOCK)).toBe(true)
  })
})

describe('countTradingDaysAway', () => {
  it('is 0 on the entry date', () => {
    expect(countTradingDaysAway('2026-10-27', '2026-10-27', UPCOMING_FROM_TUE)).toBe(0)
  })

  it('counts position in the upcoming list', () => {
    expect(countTradingDaysAway('2026-10-27', '2026-10-28', UPCOMING_FROM_TUE)).toBe(1)
    expect(countTradingDaysAway('2026-10-27', '2026-11-02', UPCOMING_FROM_TUE)).toBe(4)
  })

  it('is null for past, far or non-trading report dates', () => {
    expect(countTradingDaysAway('2026-10-27', '2026-10-26', UPCOMING_FROM_TUE)).toBeNull()
    expect(countTradingDaysAway('2026-10-27', '2026-12-01', UPCOMING_FROM_TUE)).toBeNull()
    expect(countTradingDaysAway('2026-10-27', '2026-10-31', UPCOMING_FROM_TUE)).toBeNull()
  })
})

describe('evaluateEarningsGate', () => {
  const base: EarningsGateInput = {
    entryDate: '2026-10-27',
    nextTradingDay: '2026-10-28',
    upcomingTradingDays: UPCOMING_FROM_TUE,
    cached: { reportDate: '2026-10-28', session: 'AMC' },
    latestFetchedAt: '2026-10-27T11:17:00Z',
    cacheReadFailed: false,
  }

  it('blocks a report inside the window', () => {
    expect(evaluateEarningsGate(base)).toEqual({
      nextReportDate: '2026-10-28', session: 'AMC', tradingDaysAway: 1, blocked: true, source: 'nasdaq', status: 'OK',
    })
  })

  it('does not block a report outside the window', () => {
    const flag = evaluateEarningsGate({ ...base, cached: { reportDate: '2026-10-30', session: 'BMO' } })
    expect(flag).toMatchObject({ blocked: false, status: 'OK', tradingDaysAway: 3, nextReportDate: '2026-10-30' })
  })

  it('is OK with no report when the cache is fresh and the symbol has none', () => {
    expect(evaluateEarningsGate({ ...base, cached: null })).toMatchObject({
      blocked: false, status: 'OK', nextReportDate: null, session: null, tradingDaysAway: null,
    })
  })

  it('is UNKNOWN for an empty cache', () => {
    expect(evaluateEarningsGate({ ...base, cached: null, latestFetchedAt: null })).toMatchObject({ blocked: false, status: 'UNKNOWN', nextReportDate: null })
  })

  it('is UNKNOWN when the cache read failed', () => {
    expect(evaluateEarningsGate({ ...base, cacheReadFailed: true })).toMatchObject({ blocked: false, status: 'UNKNOWN', nextReportDate: null })
  })

  it('is STALE and never blocks when the cache is older than 2 trading days', () => {
    const flag = evaluateEarningsGate({ ...base, latestFetchedAt: '2026-10-22T11:17:00Z' })
    expect(flag).toMatchObject({ blocked: false, status: 'STALE', nextReportDate: null, session: null, tradingDaysAway: null })
  })

  it('treats a Friday sync as fresh on Monday', () => {
    const flag = evaluateEarningsGate({
      ...base,
      entryDate: '2026-11-02',
      nextTradingDay: '2026-11-03',
      upcomingTradingDays: ['2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-09'],
      cached: { reportDate: '2026-11-03', session: 'UNKNOWN' },
      latestFetchedAt: '2026-10-30T11:17:00Z',
    })
    expect(flag).toMatchObject({ status: 'OK', blocked: true })
  })

  it('records the report but does not block when the window is 0', () => {
    expect(evaluateEarningsGate({ ...base, blockDays: 0 })).toMatchObject({ blocked: false, status: 'OK', nextReportDate: '2026-10-28' })
  })

  it('does not block and does not throw on a malformed cached date', () => {
    expect(evaluateEarningsGate({ ...base, cached: { reportDate: 'garbage', session: 'AMC' } })).toMatchObject({ blocked: false, status: 'UNKNOWN' })
  })

  it('does not block and does not throw on a malformed fetched_at', () => {
    expect(evaluateEarningsGate({ ...base, latestFetchedAt: 'nope' })).toMatchObject({ blocked: false, status: 'UNKNOWN' })
  })
})
