import { describe, it, expect } from 'vitest'

// Replicates STALE_MACRO_BARS_MAX_DAYS/isMacroBarsStale() from macro-bars-staleness.ts.
// Keep in sync with that module when its calculation logic changes.
const STALE_MACRO_BARS_MAX_DAYS = 5

function isMacroBarsStale(bars: { t: string }[], referenceDate: Date): boolean {
  if (bars.length === 0) return true
  const lastBarDate = new Date(bars[bars.length - 1].t)
  const ageDays = (referenceDate.getTime() - lastBarDate.getTime()) / (24 * 60 * 60 * 1000)
  return ageDays > STALE_MACRO_BARS_MAX_DAYS
}

function barAgeDaysAgo(referenceDate: Date, daysAgo: number): { t: string }[] {
  const barDate = new Date(referenceDate.getTime() - daysAgo * 24 * 60 * 60 * 1000)
  return [{ t: barDate.toISOString() }]
}

describe('isMacroBarsStale', () => {
  it('returns false when the newest bar is today (age 0 days)', () => {
    const referenceDate = new Date('2026-10-05T12:00:00Z')
    const bars = barAgeDaysAgo(referenceDate, 0)

    const result = isMacroBarsStale(bars, referenceDate)

    expect(result).toBe(false)
  })

  it('returns true when the newest bar is well beyond the max age (~35 days, matching the live-observed bug)', () => {
    const referenceDate = new Date('2026-10-05T12:00:00Z')
    const bars = barAgeDaysAgo(referenceDate, 35)

    const result = isMacroBarsStale(bars, referenceDate)

    expect(result).toBe(true)
  })

  it('returns true for an empty bars array', () => {
    const referenceDate = new Date('2026-10-05T12:00:00Z')

    const result = isMacroBarsStale([], referenceDate)

    expect(result).toBe(true)
  })

  it('returns false when the newest bar is exactly 3 days old (simulated weekend gap)', () => {
    const referenceDate = new Date('2026-10-05T12:00:00Z')
    const bars = barAgeDaysAgo(referenceDate, 3)

    const result = isMacroBarsStale(bars, referenceDate)

    expect(result).toBe(false)
  })

  it('returns false when the newest bar is exactly 4 days old (simulated weekend + 1 holiday gap)', () => {
    const referenceDate = new Date('2026-10-05T12:00:00Z')
    const bars = barAgeDaysAgo(referenceDate, 4)

    const result = isMacroBarsStale(bars, referenceDate)

    expect(result).toBe(false)
  })

  it('returns false at exactly the STALE_MACRO_BARS_MAX_DAYS boundary (5.0 days)', () => {
    const referenceDate = new Date('2026-10-05T12:00:00Z')
    const bars = barAgeDaysAgo(referenceDate, STALE_MACRO_BARS_MAX_DAYS)

    const result = isMacroBarsStale(bars, referenceDate)

    expect(result).toBe(false)
  })

  it('returns true one day beyond the STALE_MACRO_BARS_MAX_DAYS boundary', () => {
    const referenceDate = new Date('2026-10-05T12:00:00Z')
    const bars = barAgeDaysAgo(referenceDate, STALE_MACRO_BARS_MAX_DAYS + 1)

    const result = isMacroBarsStale(bars, referenceDate)

    expect(result).toBe(true)
  })
})
