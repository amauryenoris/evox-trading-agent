import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { getNextTradingDay } from '../alpaca'

function mockFetchCalendar(days: Array<{ date: string; open: string }>) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(days),
  }))
}

function mockFetchThrows(message = 'network error') {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error(message)))
}

beforeEach(() => {
  process.env.ALPACA_API_KEY    = 'test-key'
  process.env.ALPACA_SECRET_KEY = 'test-secret'
  process.env.ALPACA_BASE_URL   = 'https://paper-api.alpaca.markets'
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('getNextTradingDay', () => {
  describe('happy path', () => {
    it('returns midnight UTC of the 1st next trading day (default daysAhead=1)', async () => {
      // Arrange — fromDate is 2026-06-06 (Friday), next trading day is Mon 2026-06-09
      const fromDate = new Date('2026-06-06T12:00:00Z')
      mockFetchCalendar([
        { date: '2026-06-05', open: '09:30' }, // before fromDate — excluded
        { date: '2026-06-06', open: '09:30' }, // same as fromDate — excluded by strict >
        { date: '2026-06-09', open: '09:30' }, // 1st trading day after fromDate
        { date: '2026-06-10', open: '09:30' },
      ])

      // Act
      const result = await getNextTradingDay(fromDate)

      // Assert
      expect(result).toEqual(new Date('2026-06-09T00:00:00Z'))
    })

    it('returns midnight UTC of the 3rd next trading day when daysAhead=3', async () => {
      // Arrange
      const fromDate = new Date('2026-06-06T00:00:00Z')
      mockFetchCalendar([
        { date: '2026-06-08', open: '09:30' }, // 1st
        { date: '2026-06-09', open: '09:30' }, // 2nd
        { date: '2026-06-10', open: '09:30' }, // 3rd
        { date: '2026-06-11', open: '09:30' },
      ])

      // Act
      const result = await getNextTradingDay(fromDate, 3)

      // Assert
      expect(result).toEqual(new Date('2026-06-10T00:00:00Z'))
    })

    it('excludes fromDate from the trading day count', async () => {
      // Arrange — calendar includes fromDate itself
      const fromDate = new Date('2026-06-09T00:00:00Z')
      mockFetchCalendar([
        { date: '2026-06-09', open: '09:30' }, // fromDate — must be excluded
        { date: '2026-06-10', open: '09:30' }, // 1st trading day after
      ])

      // Act
      const result = await getNextTradingDay(fromDate)

      // Assert — must be 06-10, not 06-09
      expect(result).toEqual(new Date('2026-06-10T00:00:00Z'))
    })

    it('always returns T00:00:00Z (midnight UTC)', async () => {
      // Arrange
      const fromDate = new Date('2026-06-06T18:45:00Z')
      mockFetchCalendar([{ date: '2026-06-09', open: '09:30' }])

      // Act
      const result = await getNextTradingDay(fromDate)

      // Assert — no time component from the API response leaks through
      expect(result.toISOString()).toBe('2026-06-09T00:00:00.000Z')
    })
  })

  describe('fallback A — insufficient trading days', () => {
    it('falls back to +daysAhead calendar days when API returns too few days', async () => {
      // Arrange — only 0 days returned for daysAhead=2
      const fromDate = new Date('2026-06-06T00:00:00Z')
      mockFetchCalendar([]) // empty — fewer than daysAhead=2
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      // Act
      const result = await getNextTradingDay(fromDate, 2)

      // Assert — fallback: 2026-06-06 + 2 calendar days = 2026-06-08
      expect(result).toEqual(new Date('2026-06-08T00:00:00Z'))
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[CALENDAR_FALLBACK]'))
    })

    it('fallback result is midnight UTC', async () => {
      // Arrange
      const fromDate = new Date('2026-06-06T23:59:59Z')
      mockFetchCalendar([])
      vi.spyOn(console, 'warn').mockImplementation(() => {})

      // Act
      const result = await getNextTradingDay(fromDate, 1)

      // Assert
      expect(result.toISOString().endsWith('T00:00:00.000Z')).toBe(true)
    })
  })

  describe('fallback B — API error', () => {
    it('falls back to +daysAhead calendar days when fetch throws', async () => {
      // Arrange
      const fromDate = new Date('2026-06-06T00:00:00Z')
      mockFetchThrows('timeout')
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      // Act
      const result = await getNextTradingDay(fromDate, 1)

      // Assert — fallback: 2026-06-06 + 1 = 2026-06-07
      expect(result).toEqual(new Date('2026-06-07T00:00:00Z'))
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[CALENDAR_FALLBACK]'),
        expect.any(Error)
      )
    })

    it('fallback result is midnight UTC', async () => {
      // Arrange
      const fromDate = new Date('2026-06-10T15:30:00Z')
      mockFetchThrows()
      vi.spyOn(console, 'warn').mockImplementation(() => {})

      // Act
      const result = await getNextTradingDay(fromDate, 3)

      // Assert
      expect(result.toISOString().endsWith('T00:00:00.000Z')).toBe(true)
    })
  })
})
