import { describe, it, expect } from 'vitest'
import { REJECTED_FILTER, REJECTED_LABELS, classifyRejected, buildRejectedReason } from '../rejected-classification'
import { isEarningsBlockError, buildEarningsBlockReason } from '../earnings-window'
import { buildTrend3DayAboveSma5Reason } from '../sma5-exit'

describe('Rejected-today classification of the new prefixes', () => {
  it('filters on both new prefixes and keeps the four old ones', () => {
    for (const prefix of ['TREND_ZGT125', 'TREND_QUALITY_FAIL', 'Spread gate', 'MR_RANGING_ADX_GATE', 'EARNINGS_BLOCK', 'TREND_3DAY_ABOVE_SMA5']) {
      expect(REJECTED_FILTER).toContain(`error.ilike.${prefix}%`)
    }
  })

  it('classifies EARNINGS_BLOCK and shows the report date and timing', () => {
    const error = buildEarningsBlockReason('GOOGL', '2026-10-28', 'AMC')
    const kind = classifyRejected(error)
    expect(kind).toBe('EARNINGS_BLOCK')
    expect(buildRejectedReason(kind, error, null, null)).toBe('GOOGL reports 2026-10-28 (after close)')
    expect(REJECTED_LABELS[kind]).toBe('EARNINGS')
  })

  it('classifies TREND_3DAY_ABOVE_SMA5 with its price text', () => {
    const error = buildTrend3DayAboveSma5Reason(101.5, 100)
    const kind = classifyRejected(error)
    expect(kind).toBe('TREND_3DAY_ABOVE_SMA5')
    expect(buildRejectedReason(kind, error, null, null)).toBe('price $101.50 >= SMA5 $100.00 (3DAY exit would fire immediately)')
    expect(REJECTED_LABELS[kind]).toBe('SMA5')
  })

  it.each([
    ['TREND_ZGT125: excluded — zScore > 1.25', 'TREND_ZGT125'],
    ['TREND_QUALITY_FAIL: adx=12.0 slope=flat', 'TREND_QUALITY_FAIL'],
    ['Spread gate: 80bps > 50bps', 'SPREAD_GATE'],
    ['MR_RANGING_ADX_GATE: z-score -1.4', 'MR_RANGING_ADX_GATE'],
  ])('still classifies %s', (error, expected) => {
    expect(classifyRejected(error)).toBe(expected)
  })

  it('keeps the old reason texts', () => {
    expect(buildRejectedReason('TREND_ZGT125', '', 1.3, null)).toBe('z-score 1.300 > 1.25 threshold')
    expect(buildRejectedReason('TREND_QUALITY_FAIL', '', null, 12)).toBe('ADX 12.0 < 20 — trend not confirmed')
    expect(buildRejectedReason('SPREAD_GATE', 'Spread gate: 80bps', null, null)).toBe('80bps')
  })
})

// Mirrors the branch order of the HOLDs Breakdown loop in report-generator.ts
function bucket(err: string): 'earnings' | 'gate4' | 'other' {
  if (isEarningsBlockError(err)) return 'earnings'
  if (err.includes('gate') || err.includes('Gate')) return 'gate4'
  return 'other'
}

describe('weekly report classification', () => {
  it('puts an EARNINGS_BLOCK hold in its own bucket ahead of the generic gate branch', () => {
    expect(bucket('EARNINGS_BLOCK: GOOGL reports 2026-10-28 (after close)')).toBe('earnings')
    expect(bucket('Spread gate: 80bps')).toBe('gate4')
  })

  it('does not treat other errors as earnings blocks', () => {
    expect(isEarningsBlockError(undefined)).toBe(false)
    expect(isEarningsBlockError('Already in position')).toBe(false)
  })
})
