import { describe, it, expect } from 'vitest'
import { isDateRangeIncomplete, isDateRangeInverted } from '../report-validation'

// Replicates the customStart/customEnd parsing + validation chain from
// getDateRange() in report-generator.ts (lines 51-89). Keep in sync when
// that chain changes. getDateRange() itself is not exported.
function assertNoCalendarRollover(dateStr: string, parsed: Date): void {
  const [y, m, d] = dateStr.split('-').map(Number)
  if (
    parsed.getFullYear() !== y ||
    parsed.getMonth() !== m - 1 ||
    parsed.getDate() !== d
  ) {
    throw new Error('Invalid date: day/month out of range for customStart/customEnd')
  }
}

function parseCustomRange(customStart: string, customEnd: string): { rangeStart: Date; rangeEnd: Date } {
  const rangeStart = new Date(customStart + 'T00:00:00')
  const rangeEnd = new Date(customEnd + 'T23:59:59.999')
  if (Number.isNaN(rangeStart.getTime()) || Number.isNaN(rangeEnd.getTime())) {
    throw new Error('Invalid date format for customStart/customEnd')
  }
  assertNoCalendarRollover(customStart, rangeStart)
  assertNoCalendarRollover(customEnd, rangeEnd)
  return { rangeStart, rangeEnd }
}

describe('getDateRange — custom range validation', () => {
  it('parses a valid ISO date pair without throwing', () => {
    const { rangeStart, rangeEnd } = parseCustomRange('2026-06-01', '2026-06-14')
    expect(Number.isNaN(rangeStart.getTime())).toBe(false)
    expect(Number.isNaN(rangeEnd.getTime())).toBe(false)
    expect(rangeStart.getFullYear()).toBe(2026)
    expect(rangeEnd.getDate()).toBe(14)
  })

  it('accepts a range longer than 7 days (no cap)', () => {
    const { rangeStart, rangeEnd } = parseCustomRange('2026-01-01', '2026-03-01')
    const days = (rangeEnd.getTime() - rangeStart.getTime()) / 86_400_000
    expect(days).toBeGreaterThan(7)
  })

  it('throws a descriptive error for an invalid start date string', () => {
    expect(() => parseCustomRange('not-a-date', '2026-06-14')).toThrow(
      'Invalid date format for customStart/customEnd'
    )
  })

  it('throws a descriptive error for an invalid end date string', () => {
    expect(() => parseCustomRange('2026-06-01', 'not-a-date')).toThrow(
      'Invalid date format for customStart/customEnd'
    )
  })

  it('throws for an empty string passed as a date', () => {
    expect(() => parseCustomRange('', '2026-06-14')).toThrow(
      'Invalid date format for customStart/customEnd'
    )
  })

  it('throws a calendar-rollover error for a non-existent day (Feb 30)', () => {
    expect(() => parseCustomRange('2026-02-30', '2026-06-14')).toThrow(
      'Invalid date: day/month out of range for customStart/customEnd'
    )
  })

  it('throws a calendar-rollover error when the end date rolls over', () => {
    expect(() => parseCustomRange('2026-06-01', '2026-02-30')).toThrow(
      'Invalid date: day/month out of range for customStart/customEnd'
    )
  })

  it('does not throw for a valid leap-day date', () => {
    // 2028 is a leap year — Feb 29 is real and must not be flagged as rollover
    expect(() => parseCustomRange('2028-02-29', '2028-03-01')).not.toThrow()
  })
})

describe('isDateRangeIncomplete (shared validation, imported from real module)', () => {
  it('returns true when only start is provided', () => {
    expect(isDateRangeIncomplete('2026-06-01', undefined)).toBe(true)
  })

  it('returns true when only end is provided', () => {
    expect(isDateRangeIncomplete(undefined, '2026-06-14')).toBe(true)
  })

  it('returns false when both are provided', () => {
    expect(isDateRangeIncomplete('2026-06-01', '2026-06-14')).toBe(false)
  })

  it('returns false when neither is provided', () => {
    expect(isDateRangeIncomplete(undefined, undefined)).toBe(false)
    expect(isDateRangeIncomplete('', '')).toBe(false)
  })
})

describe('isDateRangeInverted (shared validation, imported from real module)', () => {
  it('returns true when start is after end', () => {
    expect(isDateRangeInverted('2026-06-14', '2026-06-01')).toBe(true)
  })

  it('returns false when start is before end', () => {
    expect(isDateRangeInverted('2026-06-01', '2026-06-14')).toBe(false)
  })

  it('returns false when start equals end', () => {
    expect(isDateRangeInverted('2026-06-01', '2026-06-01')).toBe(false)
  })
})

// Replicates the catch-block error discrimination added to
// src/app/api/reports/generate/route.ts — distinguishes the validation
// error from other unexpected errors without restructuring the handler.
function statusForError(err: unknown): number {
  if (err instanceof Error && err.message.includes('Invalid date format')) {
    return 400
  }
  return 500
}

describe('route.ts — error status discrimination', () => {
  it('maps the date-validation error to 400', () => {
    expect(statusForError(new Error('Invalid date format for customStart/customEnd'))).toBe(400)
  })

  it('maps any other error to 500', () => {
    expect(statusForError(new Error('Storage upload failed: boom'))).toBe(500)
    expect(statusForError('not an Error instance')).toBe(500)
  })
})
