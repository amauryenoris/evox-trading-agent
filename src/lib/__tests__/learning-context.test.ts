import { describe, it, expect } from 'vitest'
import type { TradeEvaluation, TechnicalIndicators } from '../types'
import {
  buildSetupLearningBlock,
  buildPatternIds,
  isHardRuleLesson,
  HARD_RULE_LESSON_PATTERNS,
  LESSONS_PER_TRADE,
  HARD_RULE_FILTER_ENABLED,
  SHOW_EXPLORATORY_BUCKETS,
  SECTOR_RS_RELIABLE_FROM,
  MAX_BLOCK_LINES,
  MAX_BLOCK_CHARS,
  type SetupLearningInput,
  type StoredLearningSnapshot,
} from '../learning-context'
import { REAL_LESSONS, buildRegressionCases } from './fixtures/lessons-real-samples'
import golden from './fixtures/lessons-block-golden.json'

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

    const { text } = buildSetupLearningBlock(input({
      trades,
      indicators: makeIndicators({ macd: { macdLine: 0, signalLine: 0, histogram: -1 } }),
      options: { showExploratoryBuckets: true },
    }))

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
      makeTrade({ symbol: 'AAA', sellTimestamp: '2026-09-05T14:00:00Z', lessonsLearned: ['clean one'] }),
      makeTrade({ symbol: 'BBB', sellTimestamp: '2026-09-04T14:00:00Z', lessonsLearned: ['clean two'] }),
      makeTrade({ symbol: 'CCC', sellTimestamp: '2026-09-03T14:00:00Z', lessonsLearned: ['lost $4.00 on it'] }),
    ]

    const { snapshot } = buildSetupLearningBlock(input({ trades }))

    expect(snapshot.lessonsShown).toHaveLength(2)
    expect(snapshot.filteredLessonCount).toBe(1)
  })

  it('does not count in filteredLessonCount a lesson already excluded by the sector-RS cutoff', () => {
    const preFix = makeTrade({
      buyTimestamp: '2026-10-05T10:00:00-04:00',
      lessonsLearned: ['lost $9.00 on sector rs'],
      buyIndicators: { ...makeIndicators(), sectorRotation: { gdx: 33 } } as TechnicalIndicators,
    })

    const { snapshot } = buildSetupLearningBlock(input({ trades: [preFix] }))

    expect(snapshot.excludedLessonCount).toBe(1)
    expect(snapshot.filteredLessonCount).toBe(0)
  })

  it('does not count a lesson from another setup', () => {
    const trades = [makeTrade({ signal_type: 'TREND_ZLE05', lessonsLearned: ['lost $7.00 other setup'] }), makeTrade()]

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
      makeTrade({ symbol: 'L1', sellTimestamp: '2026-09-30T14:00:00Z', lessonsLearned: [long] }),
      makeTrade({ symbol: 'L2', sellTimestamp: '2026-09-29T14:00:00Z', lessonsLearned: [long] }),
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
      makeTrade({ symbol: 'A', lessonsLearned: ['lost $11.16', 'lost $2.50 more'] }),
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

  it('returns a version-3 snapshot whose text equals the block text', () => {
    const { text, snapshot } = buildSetupLearningBlock(input({ trades: [makeTrade()] }))

    expect(snapshot.version).toBe(3)
    expect(snapshot.setup).toBe('MEAN_REVERSION')
    expect(snapshot.asOf).toBe(ASOF)
    expect(snapshot.text).toBe(text)
    expect(Object.keys(snapshot).sort()).toEqual(
      ['asOf', 'baseline', 'bucketsShown', 'excludedLessonCount', 'exploratoryHidden', 'filteredLessonCount', 'hardRuleLessonsFiltered', 'lessonsShown', 'setup', 'text', 'version']
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

  it('accepts a stored version-2 snapshot', () => {
    const { snapshot } = buildSetupLearningBlock(input({ trades: [] }))
    const stored: StoredLearningSnapshot = {
      version: 2,
      setup: 'MEAN_REVERSION',
      asOf: ASOF,
      text: '',
      baseline: snapshot.baseline,
      bucketsShown: [{ dimension: 'adx_bucket', bucket: 'MID', n: 8 }],
      lessonsShown: [],
      excludedLessonCount: 0,
      filteredLessonCount: 0,
    }

    expect(buildPatternIds(stored)).toEqual(['MEAN_REVERSION|adx_bucket|MID'])
  })
})

describe('switch constants', () => {
  it('ships one lesson per trade, the hard-rule filter on and exploratory buckets hidden', () => {
    expect(LESSONS_PER_TRADE).toBe(1)
    expect(HARD_RULE_FILTER_ENABLED).toBe(true)
    expect(SHOW_EXPLORATORY_BUCKETS).toBe(false)
  })
})

describe('isHardRuleLesson', () => {
  it.each([
    REAL_LESSONS.neverAdx30,
    REAL_LESSONS.veto,
    REAL_LESSONS.hardFilter,
    REAL_LESSONS.avoidEntries,
    'Do not enter TREND_PULLBACK setups when the MACD histogram is deeply negative.',
    'A trade like this must not be taken.',
    'The entry should be rejected outright.',
    'It should be automatically disqualified.',
    'It is not wise: never enter a long position when EXIT_LONG is set.',
  ])('flags prohibition or veto wording: "%s"', (lesson) => {
    expect(isHardRuleLesson(lesson)).toBe(true)
  })

  it.each([
    REAL_LESSONS.notHardGate,
    REAL_LESSONS.notDisqualifying,
    REAL_LESSONS.strongDowntrend,
    REAL_LESSONS.stronglyTrending,
    REAL_LESSONS.cleanOne,
    'This is not a veto condition.',
    'Weak ADX is not a hard filter for this setup.',
  ])('does not flag a lesson that merely discusses a rule or has no rule wording: "%s"', (lesson) => {
    expect(isHardRuleLesson(lesson)).toBe(false)
  })

  it('exports the patterns as a non-empty list of regular expressions', () => {
    expect(HARD_RULE_LESSON_PATTERNS.length).toBeGreaterThan(0)
    expect(HARD_RULE_LESSON_PATTERNS.every((p) => p instanceof RegExp)).toBe(true)
  })
})

describe('buildSetupLearningBlock — one lesson per trade', () => {
  const threeLessons = (symbol: string, sell: string, tag: string) =>
    makeTrade({ symbol, sellTimestamp: sell, lessonsLearned: [`${tag} first`, `${tag} second`, `${tag} third`] })

  it('never shows two lessons from the same trade when every trade has three lessons', () => {
    const trades = [
      threeLessons('AAA', '2026-09-01T14:00:00Z', 'oldest'),
      threeLessons('BBB', '2026-09-02T14:00:00Z', 'middle'),
      threeLessons('CCC', '2026-09-03T14:00:00Z', 'newest'),
    ]

    const { text, snapshot } = buildSetupLearningBlock(input({ trades }))

    expect(snapshot.lessonsShown).toHaveLength(2)
    expect(new Set(snapshot.lessonsShown.map((l) => l.tradeId)).size).toBe(2)
    expect(text).toContain('newest first (CCC')
    expect(text).toContain('middle first (BBB')
    expect(text).not.toContain('newest second')
    expect(text).not.toContain('oldest')
  })

  it('shows a single lesson when only one trade has lessons', () => {
    const { snapshot } = buildSetupLearningBlock(input({ trades: [threeLessons('AAA', '2026-09-01T14:00:00Z', 'only')] }))

    expect(snapshot.lessonsShown).toHaveLength(1)
  })

  it('skips a trade without eligible lessons and moves to the next older trade', () => {
    const trades = [
      makeTrade({ symbol: 'NEW', sellTimestamp: '2026-09-03T14:00:00Z', lessonsLearned: ['lost $3.00 here'] }),
      makeTrade({ symbol: 'MID', sellTimestamp: '2026-09-02T14:00:00Z', lessonsLearned: [] }),
      threeLessons('OLD', '2026-09-01T14:00:00Z', 'older'),
    ]

    const { snapshot } = buildSetupLearningBlock(input({ trades }))

    expect(snapshot.lessonsShown.map((l) => l.symbol)).toEqual(['OLD'])
  })

  it('takes the first eligible lesson of a trade in stored order', () => {
    const trades = [makeTrade({ symbol: 'AAA', lessonsLearned: ['lost $3.00 here', 'second is eligible', 'third is eligible'] })]

    const { text } = buildSetupLearningBlock(input({ trades }))

    expect(text).toContain('second is eligible')
    expect(text).not.toContain('third is eligible')
  })

  it('with three lessons per trade allowed it takes both slots from the newest trade, as before', () => {
    const trades = [threeLessons('CCC', '2026-09-03T14:00:00Z', 'newest'), threeLessons('BBB', '2026-09-02T14:00:00Z', 'middle')]

    const { snapshot } = buildSetupLearningBlock(input({ trades, options: { lessonsPerTrade: 3 } }))

    expect(snapshot.lessonsShown).toHaveLength(2)
    expect(snapshot.lessonsShown.every((l) => l.symbol === 'CCC')).toBe(true)
  })
})

describe('buildSetupLearningBlock — lesson filters after the change', () => {
  it('lets lessons through that use "strong" or "strongly" descriptively', () => {
    const trades = [
      makeTrade({ symbol: 'AAA', sellTimestamp: '2026-09-02T14:00:00Z', lessonsLearned: [REAL_LESSONS.strongDowntrend] }),
      makeTrade({ symbol: 'BBB', sellTimestamp: '2026-09-01T14:00:00Z', lessonsLearned: [REAL_LESSONS.stronglyTrending] }),
    ]

    const { text, snapshot } = buildSetupLearningBlock(input({ trades }))

    expect(text).toContain('against a strong downtrend')
    expect(text).toContain('ranging rather than strongly trending')
    expect(snapshot.filteredLessonCount).toBe(0)
  })

  it('drops hard-rule lessons and counts them in hardRuleLessonsFiltered only', () => {
    const trades = [
      makeTrade({ symbol: 'AAA', sellTimestamp: '2026-09-03T14:00:00Z', lessonsLearned: [REAL_LESSONS.neverAdx30, REAL_LESSONS.veto, REAL_LESSONS.cleanOne] }),
    ]

    const { text, snapshot } = buildSetupLearningBlock(input({ trades }))

    expect(text).not.toContain('Never execute')
    expect(text).not.toContain('veto condition')
    expect(text).toContain('Extreme Kalman filter z-scores')
    expect(snapshot.hardRuleLessonsFiltered).toBe(2)
    expect(snapshot.filteredLessonCount).toBe(0)
  })

  it('counts hard-rule lessons even when the slots are already full', () => {
    const trades = [
      makeTrade({ symbol: 'AAA', sellTimestamp: '2026-09-05T14:00:00Z', lessonsLearned: ['clean one'] }),
      makeTrade({ symbol: 'BBB', sellTimestamp: '2026-09-04T14:00:00Z', lessonsLearned: ['clean two'] }),
      makeTrade({ symbol: 'CCC', sellTimestamp: '2026-09-03T14:00:00Z', lessonsLearned: [REAL_LESSONS.hardFilter] }),
    ]

    const { snapshot } = buildSetupLearningBlock(input({ trades }))

    expect(snapshot.lessonsShown).toHaveLength(2)
    expect(snapshot.hardRuleLessonsFiltered).toBe(1)
  })

  it('does not count a lesson twice when it matches both filters', () => {
    const trades = [makeTrade({ symbol: 'AAA', lessonsLearned: ['lost $5.00, so never enter a trade like this'] })]

    const { snapshot } = buildSetupLearningBlock(input({ trades }))

    expect(snapshot.filteredLessonCount).toBe(1)
    expect(snapshot.hardRuleLessonsFiltered).toBe(0)
  })

  it('keeps lessons that only discuss a rule', () => {
    const trades = [
      makeTrade({ symbol: 'AAA', sellTimestamp: '2026-09-02T14:00:00Z', lessonsLearned: [REAL_LESSONS.notHardGate] }),
      makeTrade({ symbol: 'BBB', sellTimestamp: '2026-09-01T14:00:00Z', lessonsLearned: [REAL_LESSONS.notDisqualifying] }),
    ]

    const { snapshot } = buildSetupLearningBlock(input({ trades }))

    expect(snapshot.lessonsShown).toHaveLength(2)
    expect(snapshot.hardRuleLessonsFiltered).toBe(0)
  })

  it('keeps hard-rule lessons and counts none when the filter is disabled', () => {
    const trades = [makeTrade({ symbol: 'AAA', lessonsLearned: [REAL_LESSONS.neverAdx30] })]

    const { text, snapshot } = buildSetupLearningBlock(input({ trades, options: { hardRuleFilterEnabled: false } }))

    expect(text).toContain('Never execute a mean-reversion trade when ADX exceeds 30')
    expect(snapshot.hardRuleLessonsFiltered).toBe(0)
  })
})

describe('buildSetupLearningBlock — exploratory buckets', () => {
  const trades = [...manyTrades(8, 'MID', 1), ...manyTrades(8, 'LOW', -1)].map((t, i) => ({
    ...t,
    stateFingerprint: { ...fp(i < 8 ? 'MID' : 'LOW'), macd_bucket: i % 2 === 0 ? 'NEGATIVE' : 'POSITIVE' },
  }))
  const indicators = makeIndicators({ macd: { macdLine: 0, signalLine: 0, histogram: -1 } })

  it('hides exploratory lines by default and keeps the snapshot equal to what the model saw', () => {
    const { text, snapshot } = buildSetupLearningBlock(input({ trades, indicators }))

    expect(text).not.toContain('exploratory')
    expect(text).not.toContain('macd_bucket=')
    expect(text).toContain('adx_bucket=MID')
    expect(snapshot.bucketsShown.map((b) => b.dimension)).not.toContain('macd_bucket')
    expect(buildPatternIds(snapshot).some((id) => id.includes('macd_bucket'))).toBe(false)
    expect(snapshot.exploratoryHidden).toBeGreaterThan(0)
  })

  it('shows them after the confirmatory ones when enabled and reports none hidden', () => {
    const { text, snapshot } = buildSetupLearningBlock(input({ trades, indicators, options: { showExploratoryBuckets: true } }))

    expect(text).toContain('macd_bucket=NEGATIVE [exploratory]')
    expect(text.indexOf('adx_bucket=')).toBeLessThan(text.indexOf('macd_bucket='))
    expect(snapshot.bucketsShown.map((b) => b.dimension)).toContain('macd_bucket')
    expect(snapshot.exploratoryHidden).toBe(0)
  })

  it('counts the hidden lines as the difference between the two settings', () => {
    const hidden = buildSetupLearningBlock(input({ trades, indicators }))
    const shown = buildSetupLearningBlock(input({ trades, indicators, options: { showExploratoryBuckets: true } }))

    expect(shown.snapshot.bucketsShown.length - hidden.snapshot.bucketsShown.length).toBe(hidden.snapshot.exploratoryHidden)
  })
})

describe('buildSetupLearningBlock — regression with the switches at their old values', () => {
  const OLD = { lessonsPerTrade: 3, hardRuleFilterEnabled: false, showExploratoryBuckets: true }
  const goldenByName = golden as unknown as Record<string, { text: string; lessonTradeIds: string[]; bucketsShown: unknown[] }>

  it.each(buildRegressionCases().map((c) => [c.name, c] as const))('reproduces the pre-change block: %s', (name, c) => {
    const { text, snapshot } = buildSetupLearningBlock({ ...c.input, options: OLD })

    expect(text).toBe(goldenByName[name].text)
    expect(snapshot.lessonsShown.map((l) => l.tradeId)).toEqual(goldenByName[name].lessonTradeIds)
    expect(snapshot.bucketsShown).toEqual(goldenByName[name].bucketsShown)
  })

  it('with the shipped settings the MR block has no hard-rule wording, two distinct trades and no exploratory line', () => {
    const c = buildRegressionCases()[0]

    const { text, snapshot } = buildSetupLearningBlock(c.input)

    expect(text).not.toMatch(/hard filter|Never execute|veto condition/)
    expect(text).not.toContain('exploratory')
    expect(new Set(snapshot.lessonsShown.map((l) => l.tradeId)).size).toBe(snapshot.lessonsShown.length)
    expect(snapshot.lessonsShown).toHaveLength(2)
    expect(text).toContain('soft caution flag rather than a hard gate')
    expect(text).toContain('Price remaining well above SMA200')
    expect(text).toContain('Lessons from single trades; hypotheses that may be wrong:')
    expect(text.trimEnd().endsWith('This block informs; it never gates entries.')).toBe(true)
  })
})
