import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ExitReason } from '../types'
import { getTradingDaysOpen, computeCooldownUntil, toExitReason } from '../exit-cooldown'

const NOW_ISO = '2026-11-04T15:30:00.000Z'
const MS_PER_DAY = 86_400_000

describe('getTradingDaysOpen', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(NOW_ISO))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  function daysAgo(calendarDays: number): string {
    return new Date(new Date(NOW_ISO).getTime() - calendarDays * MS_PER_DAY).toISOString()
  }

  it('returns 0 when the position was opened right now', () => {
    // Arrange / Act
    const days = getTradingDaysOpen(NOW_ISO)

    // Assert
    expect(days).toBe(0)
  })

  it('floors 1.4 calendar days to 1 trading day', () => {
    // Arrange / Act
    const days = getTradingDaysOpen(daysAgo(1.4))

    // Assert
    expect(days).toBe(1)
  })

  it('reaches exactly 20 at 28 calendar days (the time-stop boundary) and 19 at 27', () => {
    // Arrange / Act / Assert
    expect(getTradingDaysOpen(daysAgo(28))).toBe(20)
    expect(getTradingDaysOpen(daysAgo(27))).toBe(19)
  })

  it('returns NaN for an invalid or empty timestamp', () => {
    // Arrange / Act / Assert
    expect(getTradingDaysOpen('not-a-date')).toBeNaN()
    expect(getTradingDaysOpen('')).toBeNaN()
  })
})

describe('computeCooldownUntil', () => {
  const endOfTradingDay = new Date(1)
  const nextTradingDay1 = new Date(2)
  const nextTradingDay3 = new Date(3)

  it.each<[ExitReason, Date]>([
    ['Z_SCORE_EXIT', endOfTradingDay],
    ['PROFIT_TARGET', endOfTradingDay],
    ['SMA5_RECLAIM', endOfTradingDay],
    ['TRAILING_STOP', nextTradingDay1],
    ['EMA_FAILURE', nextTradingDay1],
    ['STOP_LOSS', nextTradingDay3],
  ])('maps %s to the expected date object', (reason, expected) => {
    // Arrange / Act
    const result = computeCooldownUntil(reason, endOfTradingDay, nextTradingDay1, nextTradingDay3)

    // Assert
    expect(result).toBe(expected)
  })

  it.each<ExitReason>(['TIME_STOP', 'UNKNOWN'])('returns null for %s', (reason) => {
    // Arrange / Act
    const result = computeCooldownUntil(reason, endOfTradingDay, nextTradingDay1, nextTradingDay3)

    // Assert
    expect(result).toBeNull()
  })

  it('returns null for a value outside the ExitReason union (default branch)', () => {
    // Arrange / Act
    const result = computeCooldownUntil('BOGUS' as ExitReason, endOfTradingDay, nextTradingDay1, nextTradingDay3)

    // Assert
    expect(result).toBeNull()
  })
})

describe('toExitReason', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    warnSpy.mockRestore()
  })

  it.each<[string, ExitReason]>([
    ['Exit rule: profit floor hit', 'TRAILING_STOP'],
    ['Exit rule: profit target reached', 'PROFIT_TARGET'],
    ['Exit rule: 20-day time stop', 'TIME_STOP'],
    ['Exit rule: z-score reverted to fair value', 'Z_SCORE_EXIT'],
    ['Exit rule: z-score reached 1.25 — move exhausted', 'Z_SCORE_EXIT'],
    ['Exit rule: price fell below EMA50', 'EMA_FAILURE'],
    ['Trailing stop triggered: price below stop', 'TRAILING_STOP'],
    ['Exit rule: price closed above SMA5', 'SMA5_RECLAIM'],
  ])('maps "%s" to %s without warning', (raw, expected) => {
    // Arrange / Act
    const result = toExitReason(raw)

    // Assert
    expect(result).toBe(expected)
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('normalizes case, spaces and hyphens before matching', () => {
    // Arrange / Act / Assert
    expect(toExitReason('  fair value  ')).toBe('Z_SCORE_EXIT')
    expect(toExitReason('fair-value')).toBe('Z_SCORE_EXIT')
    expect(toExitReason('profit-floor')).toBe('TRAILING_STOP')
    expect(toExitReason('PROFIT FLOOR + trailing stop')).toBe('TRAILING_STOP')
  })

  it.each<[string, string | null | undefined]>([
    ['""', ''],
    ['"   "', '   '],
    ['"null"', null],
    ['"undefined"', undefined],
  ])('returns UNKNOWN and warns [EXIT_REASON_EMPTY] raw=%s', (rawText, input) => {
    // Arrange / Act
    const result = toExitReason(input)

    // Assert
    expect(result).toBe('UNKNOWN')
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy).toHaveBeenCalledWith(`[EXIT_REASON_EMPTY] raw=${rawText}`)
  })

  it('returns UNKNOWN and warns [EXIT_REASON_UNMATCHED] with the untrimmed raw text', () => {
    // Arrange / Act
    const result = toExitReason('something else')

    // Assert
    expect(result).toBe('UNKNOWN')
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy).toHaveBeenCalledWith('[EXIT_REASON_UNMATCHED] raw="something else"')
  })
})
