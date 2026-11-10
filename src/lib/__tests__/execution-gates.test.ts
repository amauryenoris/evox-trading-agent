import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { checkLiquidity, checkTradingHours } from '../execution-gates'

describe('checkLiquidity', () => {
  it.each<[number, boolean]>([
    [999_999, false],
    [1_000_000, true],
    [0, false],
  ])('returns %s -> %s', (prevDayVolume, expected) => {
    // Arrange / Act
    const result = checkLiquidity(prevDayVolume)

    // Assert
    expect(result).toBe(expected)
  })
})

describe('checkTradingHours', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it.each<[string, string, boolean]>([
    ['EST 00:00 ET', '2026-11-04T05:00:00.000Z', false],
    ['EST 09:44 ET', '2026-11-04T14:44:00.000Z', false],
    ['EST 09:45 ET', '2026-11-04T14:45:00.000Z', true],
    ['EST 15:30 ET', '2026-11-04T20:30:00.000Z', true],
    ['EST 15:31 ET', '2026-11-04T20:31:00.000Z', false],
    ['EDT 00:00 ET', '2026-07-15T04:00:00.000Z', false],
    ['EDT 09:44 ET', '2026-07-15T13:44:00.000Z', false],
    ['EDT 09:45 ET', '2026-07-15T13:45:00.000Z', true],
    ['EDT 15:30 ET', '2026-07-15T19:30:00.000Z', true],
    ['EDT 15:31 ET', '2026-07-15T19:31:00.000Z', false],
    ['spring-forward day (2026-03-08, EDT) 09:44 ET', '2026-03-08T13:44:00.000Z', false],
    ['spring-forward day (2026-03-08, EDT) 09:45 ET', '2026-03-08T13:45:00.000Z', true],
    ['spring-forward day (2026-03-08, EDT) 15:30 ET', '2026-03-08T19:30:00.000Z', true],
    ['spring-forward day (2026-03-08, EDT) 15:31 ET', '2026-03-08T19:31:00.000Z', false],
    ['fall-back day (2026-11-01, EST) 09:44 ET', '2026-11-01T14:44:00.000Z', false],
    ['fall-back day (2026-11-01, EST) 09:45 ET', '2026-11-01T14:45:00.000Z', true],
    ['fall-back day (2026-11-01, EST) 15:30 ET', '2026-11-01T20:30:00.000Z', true],
    ['fall-back day (2026-11-01, EST) 15:31 ET', '2026-11-01T20:31:00.000Z', false],
    ['spring-forward transition, before (01:59 EST)', '2026-03-08T06:59:00.000Z', false],
    ['spring-forward transition, after (03:00 EDT)', '2026-03-08T07:00:00.000Z', false],
    ['fall-back transition, before (01:59 EDT)', '2026-11-01T05:59:00.000Z', false],
    ['fall-back transition, after (01:00 EST)', '2026-11-01T06:00:00.000Z', false],
    ['fall-back day midnight (00:00 EDT)', '2026-11-01T04:00:00.000Z', false],
  ])('%s (%s) -> %s', (_label, utcIso, expected) => {
    // Arrange
    vi.setSystemTime(new Date(utcIso))

    // Act
    const result = checkTradingHours()

    // Assert
    expect(result).toBe(expected)
  })
})
