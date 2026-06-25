import { describe, it, expect } from 'vitest'

// Replicates the customStart/customEnd parsing + validation chain from
// getDateRange() in report-generator.ts (lines 51-76). Keep in sync when
// that chain changes. getDateRange() itself is not exported.
function parseCustomRange(customStart: string, customEnd: string): { rangeStart: Date; rangeEnd: Date } {
  const rangeStart = new Date(customStart + 'T00:00:00')
  const rangeEnd = new Date(customEnd + 'T23:59:59.999')
  if (Number.isNaN(rangeStart.getTime()) || Number.isNaN(rangeEnd.getTime())) {
    throw new Error('Invalid date format for customStart/customEnd')
  }
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
