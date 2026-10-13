import { describe, it, expect } from 'vitest'
import type { TradeEvaluation, TechnicalIndicators } from '../types'
import {
  buildSetupLearningBlock,
  buildPatternIds,
  SECTOR_RS_RELIABLE_FROM,
  MAX_BLOCK_LINES,
  MAX_BLOCK_CHARS,
  type SetupLearningInput,
} from '../learning-context'

const ASOF = '2026-10-12T14:00:00-04:00'
let nextId = 0

function makeIndicators(overrides: Partial<TechnicalIndicators> = {}): TechnicalIndicators {
  return {
    rsi: null,
    macd: { macdLine: 0, signalLine: 0, histogram: 1 },
    bollingerBands: null,
    sma50: null,
    sma200: null,
    ema50: 100,
    ema200: null,
    distanceToEma50Pct: null,
    kalman: { stateEstimate: 100, forecastError: 0, errorStdDev: 1, zScore: -1.5, signal: 'NEUTRAL' },
    currentPrice: 100,
    volume: 0,
    prevDayVolume: 0,
    adx: 20,
    atr: null,
    atrPercentile: 0.5,
    marketRegime: 'RANGING',
    ...overrides,
  }
}

function makeTrade(overrides: Partial<TradeEvaluation> = {}): TradeEvaluation {
  nextId += 1
  return {
    id: `trade-${nextId}`,
    symbol: 'AAPL',
    buyTimestamp: '2026-09-01T14:00:00Z',
    sellTimestamp: '2026-09-05T14:00:00Z',
    buyPrice: 100,
    sellPrice: 105,
    quantity: 10,
    pnlUSD: 500,
    pnlPct: 5,
    holdingDays: 4,
    signal_type: 'MEAN_REVERSION',
    stateFingerprint: null,
    buyIndicators: makeIndicators(),
    claudePostMortem: '',
    lessonsLearned: [],
    outcome: 'profit',
    ...overrides,
  }
}

function fp(adx: string) {
  return { signal_type: 'MEAN_REVERSION', spx_regime: null, market_regime: 'RANGING', adx_bucket: adx, z_bucket: 'DEEP', macd_bucket: 'NEGATIVE', atr_bucket: 'MID' }
}

function manyTrades(count: number, adx: string, pnlPct: number, signal: TradeEvaluation['signal_type'] = 'MEAN_REVERSION'): TradeEvaluation[] {
  return Array.from({ length: count }, (_, i) =>
    makeTrade({
      signal_type: signal,
      symbol: `S${nextId}`,
      pnlPct: pnlPct + i * 0.1,
      stateFingerprint: fp(adx),
      sellTimestamp: `2026-09-${String(10 + i).padStart(2, '0')}T14:00:00Z`,
    })
  )
}

function input(overrides: Partial<SetupLearningInput> = {}): SetupLearningInput {
  return { setup: 'MEAN_REVERSION', symbol: 'ZZZ', indicators: makeIndicators(), asOf: ASOF, trades: [], ...overrides }
}

describe('buildSetupLearningBlock — track record', () => {
  it('reports the setup n, win rate, avg, median and worst in percent', () => {
    const trades = [
      makeTrade({ pnlPct: 4, outcome: 'profit' }),
      makeTrade({ pnlPct: -2, outcome: 'loss' }),
      makeTrade({ pnlPct: 6, outcome: 'profit' }),
    ]

    const { text, snapshot } = buildSetupLearningBlock(input({ trades }))

    expect(text).toContain('SETUP TRACK RECORD (MEAN_REVERSION)')
    expect(text).toContain('n=3')
    expect(text).toContain('win rate 67%')
    expect(text).toContain('avg +2.7%')
    expect(text).toContain('worst -2.0%')
    expect(snapshot.baseline.n).toBe(3)
  })

  it('counts entry rules using the latest buy-axis boundary and renders no exit line for a buy-only setup', () => {
    const trades = [
      makeTrade({ buyTimestamp: '2026-05-01T14:00:00Z' }),
      makeTrade({ buyTimestamp: '2026-07-01T14:00:00Z' }),
      makeTrade({ buyTimestamp: '2026-08-01T14:00:00Z' }),
    ]

    const { text } = buildSetupLearningBlock(input({ trades }))

    expect(text).toContain('Entry rules (ranging ADX gate added, since 2026-06-16): n=2 bought under them')
    expect(text).not.toContain('Exit rules')
    expect(text).not.toContain('Current rule version')
  })

  it('keeps the no-rule-changes line for a setup without boundaries', () => {
    const trades = [makeTrade({ signal_type: 'TREND_PULLBACK_3DAY' }), makeTrade({ signal_type: 'TREND_PULLBACK_3DAY' })]

    const { text } = buildSetupLearningBlock(input({ setup: 'TREND_PULLBACK_3DAY', trades }))

    expect(text).toContain('Current rule version: n=2 (no rule changes recorded)')
    expect(text).not.toContain('Entry rules')
    expect(text).not.toContain('Exit rules')
  })

  it('states there are no closed trades when the setup is empty and drops sections a, b and d', () => {
    const other = [makeTrade({ signal_type: 'TREND_ZLE05', symbol: 'ZZZ', lessonsLearned: ['other setup lesson'] })]

    const { text, snapshot } = buildSetupLearningBlock(input({ setup: 'TREND_PULLBACK_3DAY', trades: other }))

    expect(text).toContain('No closed trades for TREND_PULLBACK_3DAY')
    expect(text).not.toContain('SETUP TRACK RECORD')
    expect(text).not.toContain('MATCHING CONDITIONS')
    expect(text).not.toContain('Lessons from single trades')
    expect(text).toContain('SAME-SYMBOL HISTORY')
    expect(text).toContain('This block informs; it never gates entries.')
    expect(snapshot.baseline.n).toBe(0)
    expect(snapshot.bucketsShown).toEqual([])
  })
})

describe('buildSetupLearningBlock — rule axes', () => {
  const zle = (buy: string, sell: string) => makeTrade({ signal_type: 'TREND_ZLE05', buyTimestamp: buy, sellTimestamp: sell })
  const zleTrades = [
    zle('2026-05-01T14:00:00Z', '2026-05-10T14:00:00Z'),
    zle('2026-07-01T14:00:00Z', '2026-07-10T14:00:00Z'),
    zle('2026-08-01T14:00:00Z', '2026-08-10T14:00:00Z'),
    zle('2026-09-20T14:00:00Z', '2026-10-08T14:00:00Z'),
  ]

  it('renders the entry line before the exit line, each counted on its own axis', () => {
    const { text } = buildSetupLearningBlock(input({ setup: 'TREND_ZLE05', trades: zleTrades }))

    const entry = 'Entry rules (adaptive ADX gate stabilized, since 2026-06-04): n=3 bought under them'
    const exit = 'Exit rules (new exit rules trial, since 2026-10-05): n=1 sold under them'
    expect(text).toContain(entry)
    expect(text).toContain(exit)
    expect(text.indexOf(entry)).toBeLessThan(text.indexOf(exit))
    expect(text).not.toContain('Current rule version')
  })

  it('does not change the entry count when a trade closes under the exit trial', () => {
    const extra = zle('2026-05-02T14:00:00Z', '2026-10-09T14:00:00Z')

    const { text } = buildSetupLearningBlock(input({ setup: 'TREND_ZLE05', trades: [...zleTrades, extra] }))

    expect(text).toContain('n=3 bought under them')
    expect(text).toContain('n=2 sold under them')
  })
})

describe('buildSetupLearningBlock — matching conditions', () => {
  const lowAndMid = [...manyTrades(8, 'MID', 1), ...manyTrades(8, 'LOW', -1)]

  it('shows a line for the candidate bucket when the dimension is viable and n >= MIN_BUCKET_N', () => {
    const { text, snapshot } = buildSetupLearningBlock(input({ trades: lowAndMid, indicators: makeIndicators({ adx: 20 }) }))

    expect(text).toContain('adx_bucket=MID')
    expect(text).toContain('setup baseline avg')
    expect(snapshot.bucketsShown).toContainEqual({ dimension: 'adx_bucket', bucket: 'MID', n: 8 })
  })

  it('shows no line when the candidate bucket has fewer than MIN_BUCKET_N trades', () => {
    const trades = [...manyTrades(8, 'MID', 1), ...manyTrades(8, 'LOW', -1), ...manyTrades(3, 'HIGH', 2)]

    const { snapshot } = buildSetupLearningBlock(input({ trades, indicators: makeIndicators({ adx: 30 }) }))

    expect(snapshot.bucketsShown.find((b) => b.dimension === 'adx_bucket')).toBeUndefined()
  })

  it('shows no line for a dimension that is not viable', () => {
    const trades = manyTrades(10, 'MID', 1)

    const { snapshot } = buildSetupLearningBlock(input({ trades }))

    expect(snapshot.bucketsShown.find((b) => b.dimension === 'adx_bucket')).toBeUndefined()
  })

  it('never shows the diagnostic confidence dimension', () => {
    const { text } = buildSetupLearningBlock(input({ trades: lowAndMid }))

    expect(text).not.toContain('confidence_bucket')
  })

  it('marks exploratory dimensions and keeps them after confirmatory ones', () => {
    const trades = [...manyTrades(8, 'MID', 1), ...manyTrades(8, 'LOW', -1)].map((t, i) => ({
      ...t,
      stateFingerprint: { ...fp(i < 8 ? 'MID' : 'LOW'), macd_bucket: i % 2 === 0 ? 'NEGATIVE' : 'POSITIVE' },
    }))

    const { text } = buildSetupLearningBlock(input({ trades, indicators: makeIndicators({ macd: { macdLine: 0, signalLine: 0, histogram: -1 } }) }))

    const macdLine = text.split('\n').find((l) => l.includes('macd_bucket='))
    expect(macdLine).toContain('exploratory')
    expect(text.indexOf('adx_bucket=')).toBeLessThan(text.indexOf('macd_bucket='))
  })

  it('uses only the approved label wording', () => {
    const { text } = buildSetupLearningBlock(input({ trades: lowAndMid }))

    expect(text).toMatch(/too few trades|inconclusive|differs \(\+\)|differs \(-\)/)
  })
})

describe('buildSetupLearningBlock — same-symbol history', () => {
  it('lists the last 3 closed trades of the symbol of any setup, newest first', () => {
    const trades = [
      makeTrade({ symbol: 'FCX', sellTimestamp: '2026-09-01T14:00:00Z', pnlPct: 1 }),
      makeTrade({ symbol: 'FCX', sellTimestamp: '2026-09-04T14:00:00Z', pnlPct: 4, signal_type: 'TREND_ZLE05' }),
      makeTrade({ symbol: 'FCX', sellTimestamp: '2026-09-03T14:00:00Z', pnlPct: 3 }),
      makeTrade({ symbol: 'FCX', sellTimestamp: '2026-09-02T14:00:00Z', pnlPct: 2 }),
      makeTrade({ symbol: 'OTHER', sellTimestamp: '2026-09-09T14:00:00Z', pnlPct: 9 }),
    ]

    const { text } = buildSetupLearningBlock(input({ symbol: 'FCX', trades }))

    const lines = text.split('\n')
    const start = lines.findIndex((l) => l.includes('SAME-SYMBOL HISTORY'))
    const history = lines.slice(start + 1, start + 4)
    expect(history[0]).toContain('2026-09-04')
    expect(history[0]).toContain('TREND_ZLE05')
    expect(history[1]).toContain('2026-09-03')
    expect(history[2]).toContain('2026-09-02')
    expect(text).not.toContain('+9.0%')
  })

  it('omits the section when the symbol has no closed trades', () => {
    const { text } = buildSetupLearningBlock(input({ trades: [makeTrade()] }))

    expect(text).not.toContain('SAME-SYMBOL HISTORY')
  })
})

describe('buildSetupLearningBlock — lessons', () => {
  it('never shows a lesson from another setup', () => {
    const trades = [
      makeTrade({ signal_type: 'TREND_ZLE05', lessonsLearned: ['zle05-only lesson'] }),
      makeTrade({ signal_type: 'TREND_PULLBACK_3DAY', lessonsLearned: ['3day lesson'], symbol: 'FCX' }),
    ]

    const { text, snapshot } = buildSetupLearningBlock(input({ setup: 'TREND_PULLBACK_3DAY', symbol: 'FCX', trades }))

    expect(text).toContain('3day lesson')
    expect(text).not.toContain('zle05-only lesson')
    expect(snapshot.lessonsShown.every((l) => l.setup === 'TREND_PULLBACK_3DAY')).toBe(true)
  })

  it('shows at most 2 lessons from the most recent trades, tagged', () => {
    const trades = [
      makeTrade({ symbol: 'AAA', sellTimestamp: '2026-09-01T14:00:00Z', lessonsLearned: ['oldest'] }),
      makeTrade({ symbol: 'BBB', sellTimestamp: '2026-09-02T14:00:00Z', lessonsLearned: ['middle'] }),
      makeTrade({ symbol: 'CCC', sellTimestamp: '2026-09-03T14:00:00Z', lessonsLearned: ['newest'], pnlPct: -2 }),
    ]

    const { text, snapshot } = buildSetupLearningBlock(input({ trades }))

    expect(text).toContain('Lessons from single trades; hypotheses that may be wrong')
    expect(text).toContain('newest (CCC MEAN_REVERSION 2026-09-03 -2.0%)')
    expect(text).toContain('middle')
    expect(text).not.toContain('oldest')
    expect(snapshot.lessonsShown).toHaveLength(2)
  })

  it('excludes lessons from trades bought before the cutoff that carry sector-rotation data', () => {
    const preFix = makeTrade({
      symbol: 'GDX',
      buyTimestamp: '2026-10-05T10:00:00-04:00',
      sellTimestamp: '2026-10-09T14:00:00Z',
      lessonsLearned: ['sector rs was great'],
      buyIndicators: { ...makeIndicators(), sectorRotation: { gdx: 33 } } as TechnicalIndicators,
    })
    const preFixNoSector = makeTrade({ symbol: 'NOSEC', buyTimestamp: '2026-10-05T10:00:00-04:00', sellTimestamp: '2026-10-08T14:00:00Z', lessonsLearned: ['kept lesson'] })

    const { text, snapshot } = buildSetupLearningBlock(input({ trades: [preFix, preFixNoSector] }))

    expect(text).not.toContain('sector rs was great')
    expect(text).toContain('kept lesson')
    expect(snapshot.excludedLessonCount).toBe(1)
  })

  it('compares the cutoff as an instant, not as a string', () => {
    // 03:00Z on 10-06 is 23:00 on 10-05 in New York: before the cutoff, though it sorts after it as a string.
    const t = makeTrade({
      buyTimestamp: '2026-10-06T03:00:00Z',
      lessonsLearned: ['boundary lesson'],
      buyIndicators: { ...makeIndicators(), sectorRotation: {} } as TechnicalIndicators,
    })

    const { text } = buildSetupLearningBlock(input({ trades: [t] }))

    expect(SECTOR_RS_RELIABLE_FROM).toBe('2026-10-06T00:00:00-04:00')
    expect(text).not.toContain('boundary lesson')
  })

  it('omits the lessons section, header included, when none qualify', () => {
    const { text } = buildSetupLearningBlock(input({ trades: [makeTrade()] }))

    expect(text).not.toContain('Lessons from single trades')
  })
})

describe('buildSetupLearningBlock — lesson content filter', () => {
  const rejected = [
    'lost $11.16 on the stop',
    'only a 17% win rate for this pattern',
    'profit factor was 1.4',
    'signal supported by volume',
    'strong sector tailwinds',
    'it moved strongly higher',
  ]

  it.each(rejected)('skips the lesson "%s" and shows none of its text', (lesson) => {
    const trades = [makeTrade({ symbol: 'BAD', lessonsLearned: [lesson] })]

    const { text, snapshot } = buildSetupLearningBlock(input({ trades }))

    expect(text).not.toContain(lesson)
    expect(text).not.toContain('Lessons from single trades')
    expect(snapshot.lessonsShown).toEqual([])
    expect(snapshot.filteredLessonCount).toBe(1)
  })

  it('lets a clean lesson through, including one that mentions a percent', () => {
    const trades = [makeTrade({ symbol: 'OK', lessonsLearned: ['entry was 3% above EMA50'] })]

    const { text, snapshot } = buildSetupLearningBlock(input({ trades }))

    expect(text).toContain('entry was 3% above EMA50')
    expect(snapshot.filteredLessonCount).toBe(0)
  })

  it('fills the slots with the next clean lessons, newest trade first', () => {
    const trades = [
      makeTrade({ symbol: 'AAA', sellTimestamp: '2026-09-01T14:00:00Z', lessonsLearned: ['clean oldest'] }),
      makeTrade({ symbol: 'BBB', sellTimestamp: '2026-09-02T14:00:00Z', lessonsLearned: ['clean middle'] }),
      makeTrade({ symbol: 'CCC', sellTimestamp: '2026-09-03T14:00:00Z', lessonsLearned: ['lost $5.00 here', 'clean newest'] }),
    ]

    const { text, snapshot } = buildSetupLearningBlock(input({ trades }))

    expect(text).toContain('clean newest')
    expect(text).toContain('clean middle')
    expect(text).not.toContain('clean oldest')
    expect(text).not.toContain('$5.00')
    expect(snapshot.lessonsShown).toHaveLength(2)
    expect(snapshot.filteredLessonCount).toBe(1)
  })

  it('counts rejects even when the lesson slots are already full', () => {
    const trades = [
      makeTrade({ symbol: 'AAA', sellTimestamp: '2026-09-04T14:00:00Z', lessonsLearned: ['clean one', 'clean two'] }),
      makeTrade({ symbol: 'BBB', sellTimestamp: '2026-09-03T14:00:00Z', lessonsLearned: ['strong move'] }),
    ]

    const { snapshot } = buildSetupLearningBlock(input({ trades }))

    expect(snapshot.lessonsShown).toHaveLength(2)
    expect(snapshot.filteredLessonCount).toBe(1)
  })

  it('does not count in filteredLessonCount a lesson already excluded by the sector-RS cutoff', () => {
    const preFix = makeTrade({
      buyTimestamp: '2026-10-05T10:00:00-04:00',
      lessonsLearned: ['strong sector rs'],
      buyIndicators: { ...makeIndicators(), sectorRotation: { gdx: 33 } } as TechnicalIndicators,
    })

    const { snapshot } = buildSetupLearningBlock(input({ trades: [preFix] }))

    expect(snapshot.excludedLessonCount).toBe(1)
    expect(snapshot.filteredLessonCount).toBe(0)
  })

  it('does not count a lesson from another setup', () => {
    const trades = [makeTrade({ signal_type: 'TREND_ZLE05', lessonsLearned: ['strong other setup'] }), makeTrade()]

    const { snapshot } = buildSetupLearningBlock(input({ trades }))

    expect(snapshot.filteredLessonCount).toBe(0)
  })
})

describe('buildSetupLearningBlock — footer, caps, wording', () => {
  it('ends with the footer', () => {
    const { text } = buildSetupLearningBlock(input({ trades: [makeTrade()] }))

    expect(text.trimEnd().endsWith('This block informs; it never gates entries.')).toBe(true)
  })

  it('stays within the line and character caps by dropping lessons first', () => {
    const long = 'x'.repeat(1500)
    const trades = [
      ...manyTrades(8, 'MID', 1),
      ...manyTrades(8, 'LOW', -1),
      makeTrade({ symbol: 'L1', sellTimestamp: '2026-09-30T14:00:00Z', lessonsLearned: [long, long] }),
    ]

    const { text, snapshot } = buildSetupLearningBlock(input({ trades }))

    expect(text.length).toBeLessThanOrEqual(MAX_BLOCK_CHARS)
    expect(text.split('\n').length).toBeLessThanOrEqual(MAX_BLOCK_LINES)
    expect(snapshot.lessonsShown).toHaveLength(1)
    expect(text.split(long).length - 1).toBe(1)
    expect(snapshot.bucketsShown.length).toBeGreaterThan(0)
    expect(text).toContain('SETUP TRACK RECORD')
  })

  it('contains no dollar figure, profit factor, "supported" or "strong" in generated text', () => {
    const trades = [...manyTrades(8, 'MID', 1), ...manyTrades(8, 'LOW', -1)]

    const { text } = buildSetupLearningBlock(input({ trades, symbol: trades[0].symbol }))

    expect(text).not.toMatch(/\$/)
    expect(text.toLowerCase()).not.toMatch(/profit factor|supported|strong/)
  })

  it('contains none of those terms in the whole text when every lesson carries one', () => {
    const trades = [
      makeTrade({ symbol: 'A', lessonsLearned: ['lost $11.16', 'strong tailwinds'] }),
      makeTrade({ symbol: 'B', lessonsLearned: ['signal supported by volume', 'profit factor 1.4', 'a 17% win rate'] }),
    ]

    const { text } = buildSetupLearningBlock(input({ trades }))

    expect(text).not.toMatch(/\$\s?\d/)
    expect(text.toLowerCase()).not.toMatch(/profit factor|supported|strong/)
    expect(text.split('\n').filter((l) => /win rate/i.test(l))).toHaveLength(1)
    expect(text).toContain('SETUP TRACK RECORD')
  })
})

describe('buildSetupLearningBlock — purity and snapshot', () => {
  it('does not mutate its inputs and is deterministic', () => {
    const trades = [...manyTrades(8, 'MID', 1), ...manyTrades(8, 'LOW', -1)]
    const args = input({ trades })
    const before = JSON.stringify(args)

    const first = buildSetupLearningBlock(args)
    const second = buildSetupLearningBlock(args)

    expect(JSON.stringify(args)).toBe(before)
    expect(second).toEqual(first)
  })

  it('returns a version-2 snapshot whose text equals the block text', () => {
    const { text, snapshot } = buildSetupLearningBlock(input({ trades: [makeTrade()] }))

    expect(snapshot.version).toBe(2)
    expect(snapshot.setup).toBe('MEAN_REVERSION')
    expect(snapshot.asOf).toBe(ASOF)
    expect(snapshot.text).toBe(text)
    expect(Object.keys(snapshot).sort()).toEqual(
      ['asOf', 'baseline', 'bucketsShown', 'excludedLessonCount', 'filteredLessonCount', 'lessonsShown', 'setup', 'text', 'version']
    )
  })
})

describe('buildPatternIds', () => {
  it('maps each shown bucket to "{setup}|{dimension}|{bucket}"', () => {
    const trades = [...manyTrades(8, 'MID', 1), ...manyTrades(8, 'LOW', -1)]
    const { snapshot } = buildSetupLearningBlock(input({ trades }))

    expect(buildPatternIds(snapshot)).toContain('MEAN_REVERSION|adx_bucket|MID')
  })

  it('returns an empty list when no bucket was shown', () => {
    const { snapshot } = buildSetupLearningBlock(input({ trades: [] }))

    expect(buildPatternIds(snapshot)).toEqual([])
  })
})
