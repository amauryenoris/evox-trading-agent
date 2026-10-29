import { describe, it, expect } from 'vitest'
import type { TechnicalIndicators } from '../types'
import { buildSetupLearningBlock, buildPatternIds, type StoredLearningSnapshot } from '../learning-context'
import { buildEarningsPromptLine, isEarningsBlocked, type EarningsFlag } from '../earnings-window'

const ASOF = '2026-10-27T15:00:00Z'
const FOOTER = 'This block informs; it never gates entries.'

function flag(overrides: Partial<EarningsFlag> = {}): EarningsFlag {
  return { nextReportDate: '2026-10-30', session: 'AMC', tradingDaysAway: 3, blocked: false, source: 'nasdaq', status: 'OK', ...overrides }
}

function block(earnings?: EarningsFlag) {
  return buildSetupLearningBlock({
    setup: 'MEAN_REVERSION',
    symbol: 'GOOGL',
    indicators: { currentPrice: 100 } as TechnicalIndicators,
    asOf: ASOF,
    trades: [],
    earnings,
  })
}

describe('earnings line in the BUY block', () => {
  it('adds the line when the report is within 5 trading days', () => {
    const { text } = block(flag())
    expect(text).toContain('Earnings: reports 2026-10-30 (after close), 3 trading days away')
  })

  it.each([
    ['UNKNOWN', flag({ status: 'UNKNOWN', nextReportDate: null, session: null, tradingDaysAway: null })],
    ['STALE', flag({ status: 'STALE', nextReportDate: null, session: null, tradingDaysAway: null })],
    ['6 trading days away', flag({ tradingDaysAway: 6 })],
    ['unknown distance', flag({ tradingDaysAway: null })],
    ['no report', flag({ nextReportDate: null, session: null, tradingDaysAway: null })],
  ])('omits the line for %s', (_name, earnings) => {
    expect(block(earnings).text).not.toContain('Earnings:')
  })

  it('omits the line when no earnings input is given and leaves the block unchanged', () => {
    const without = block()
    expect(without.text).not.toContain('Earnings:')
    expect(Object.keys(without.snapshot)).not.toContain('earnings')
  })

  it('keeps the footer text last and unchanged', () => {
    const { text } = block(flag())
    expect(text.trimEnd().endsWith(FOOTER)).toBe(true)
  })

  it('stores the earnings object in the snapshot', () => {
    const { snapshot } = block(flag({ blocked: false }))
    expect(snapshot.version).toBe(3)
    expect(snapshot.earnings).toEqual(flag())
  })

  it('keeps stored snapshots without the field readable', () => {
    const { snapshot } = block()
    const v2: StoredLearningSnapshot = { ...snapshot, version: 2 }
    expect(buildPatternIds(v2)).toEqual([])
    expect(buildPatternIds(snapshot)).toEqual([])
  })
})

describe('buildEarningsPromptLine', () => {
  it.each([
    ['BMO', 'before open'],
    ['AMC', 'after close'],
    ['UNKNOWN', 'time not supplied'],
  ] as const)('writes the %s timing', (session, label) => {
    expect(buildEarningsPromptLine(flag({ session }))).toBe(`Earnings: reports 2026-10-30 (${label}), 3 trading days away`)
  })

  it('returns null for an undefined flag', () => {
    expect(buildEarningsPromptLine(undefined)).toBeNull()
  })
})

describe('regression: a 0-day window leaves every entry decision unchanged', () => {
  const entries = ['2026-10-27', '2026-10-30']
  const reports = ['2026-10-26', '2026-10-27', '2026-10-28', '2026-11-02', null, 'bad']

  it('never blocks, whatever the report date', () => {
    for (const entry of entries) {
      for (const report of reports) {
        expect(isEarningsBlocked(entry, report, '2026-10-28', 0).blocked).toBe(false)
      }
    }
  })
})
