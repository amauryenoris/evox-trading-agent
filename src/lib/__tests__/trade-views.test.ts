import { describe, it, expect } from 'vitest'
import type { TradeEvaluation } from '../types'
import {
  summarizeTrades,
  buildTimeline,
  groupBySymbol,
  groupBySetup,
  clampTradesLimit,
} from '../trade-views'

type Fingerprint = NonNullable<TradeEvaluation['stateFingerprint']>

let nextId = 0

function makeFingerprint(overrides: Partial<Fingerprint> = {}): Fingerprint {
  return {
    signal_type: null,
    spx_regime: null,
    market_regime: null,
    adx_bucket: null,
    z_bucket: null,
    macd_bucket: null,
    atr_bucket: null,
    ...overrides,
  }
}

function makeTrade(overrides: Partial<TradeEvaluation> = {}): TradeEvaluation {
  nextId += 1
  return {
    id: `trade-${nextId}`,
    symbol: 'AAPL',
    buyTimestamp: '2026-01-01T14:00:00Z',
    sellTimestamp: '2026-01-05T14:00:00Z',
    buyPrice: 100,
    sellPrice: 105,
    quantity: 10,
    pnlUSD: 50,
    pnlPct: 5,
    holdingDays: 4,
    signal_type: 'MEAN_REVERSION',
    stateFingerprint: null,
    buyIndicators: {
      rsi: null,
      macd: null,
      bollingerBands: null,
      sma50: null,
      sma200: null,
      ema50: null,
      ema200: null,
      distanceToEma50Pct: null,
      kalman: null,
      currentPrice: 100,
      volume: 0,
      prevDayVolume: 0,
      adx: null,
      atr: null,
      atrPercentile: null,
      marketRegime: null,
    },
    claudePostMortem: '',
    lessonsLearned: [],
    outcome: 'profit',
    ...overrides,
  }
}

describe('empty input', () => {
  it('summarizeTrades returns a zeroed/null summary', () => {
    expect(summarizeTrades([])).toEqual({
      n: 0,
      wins: 0,
      winRate: null,
      avgPnlPct: null,
      medianPnlPct: null,
      worstPnlPct: null,
      bestPnlPct: null,
    })
  })

  it('buildTimeline returns an empty array', () => {
    expect(buildTimeline([])).toEqual([])
  })

  it('groupBySymbol returns an empty array', () => {
    expect(groupBySymbol([])).toEqual([])
  })

  it('groupBySetup returns an empty array', () => {
    expect(groupBySetup([])).toEqual([])
  })
})

describe('summarizeTrades', () => {
  it('computes win rate, avg, worst and best for an odd-length array', () => {
    const trades = [
      makeTrade({ pnlPct: -10, outcome: 'loss' }),
      makeTrade({ pnlPct: 5, outcome: 'profit' }),
      makeTrade({ pnlPct: 20, outcome: 'profit' }),
    ]

    const summary = summarizeTrades(trades)

    expect(summary.n).toBe(3)
    expect(summary.wins).toBe(2)
    expect(summary.winRate).toBeCloseTo(2 / 3)
    expect(summary.medianPnlPct).toBe(5)
    expect(summary.avgPnlPct).toBeCloseTo((-10 + 5 + 20) / 3)
    expect(summary.worstPnlPct).toBe(-10)
    expect(summary.bestPnlPct).toBe(20)
  })

  it('computes median as the average of the two middle values for an even-length array', () => {
    const trades = [1, 9, 3, 7].map((pnlPct) => makeTrade({ pnlPct }))

    expect(summarizeTrades(trades).medianPnlPct).toBe(5) // sorted: 1,3,7,9 -> (3+7)/2
  })

  it('never rescales pnlPct', () => {
    const trades = [makeTrade({ pnlPct: 123.45 })]

    expect(summarizeTrades(trades).avgPnlPct).toBe(123.45)
    expect(summarizeTrades(trades).worstPnlPct).toBe(123.45)
    expect(summarizeTrades(trades).bestPnlPct).toBe(123.45)
  })
})

describe('buildTimeline', () => {
  it('sorts entries by sellTimestamp descending', () => {
    const older = makeTrade({ id: '1', sellTimestamp: '2026-01-01T00:00:00Z' })
    const newer = makeTrade({ id: '2', sellTimestamp: '2026-02-01T00:00:00Z' })

    expect(buildTimeline([older, newer]).map((e) => e.id)).toEqual(['2', '1'])
  })

  it('breaks sellTimestamp ties by id ascending', () => {
    const b = makeTrade({ id: 'b', sellTimestamp: '2026-01-05T14:00:00Z' })
    const a = makeTrade({ id: 'a', sellTimestamp: '2026-01-05T14:00:00Z' })

    expect(buildTimeline([b, a]).map((e) => e.id)).toEqual(['a', 'b'])
  })

  it('builds fingerprint chips and omits null fields', () => {
    const trade = makeTrade({
      stateFingerprint: makeFingerprint({
        adx_bucket: 'MID',
        macd_bucket: null,
        z_bucket: 'DEEP',
        atr_bucket: 'LOW',
        market_regime: 'RANGING',
      }),
    })

    expect(buildTimeline([trade])[0].fingerprintChips).toEqual(['adx:MID', 'z:DEEP', 'atr:LOW', 'regime:RANGING'])
  })

  it('returns no chips when stateFingerprint is null', () => {
    const trade = makeTrade({ stateFingerprint: null })

    expect(buildTimeline([trade])[0].fingerprintChips).toEqual([])
  })

  it('populates lessons from lessonsLearned, defaulting to an empty array', () => {
    const withLessons = makeTrade({ lessonsLearned: ['watch spread'] })
    const withoutLessons = makeTrade({ lessonsLearned: undefined as unknown as string[] })

    expect(buildTimeline([withLessons])[0].lessons).toEqual(['watch spread'])
    expect(buildTimeline([withoutLessons])[0].lessons).toEqual([])
  })

  it('maps a legacy null signal_type to UNKNOWN', () => {
    const trade = makeTrade({ signal_type: null })

    expect(buildTimeline([trade])[0].setup).toBe('UNKNOWN')
  })
})

describe('groupBySymbol', () => {
  it('flags lowSample for a setup with fewer than SYMBOL_SETUP_WARN_N trades', () => {
    const trades = [makeTrade({ symbol: 'ZZZ', signal_type: 'MEAN_REVERSION' })]

    const [group] = groupBySymbol(trades)

    expect(group.symbol).toBe('ZZZ')
    expect(group.bySetup.MEAN_REVERSION.n).toBe(1)
    expect(group.bySetup.MEAN_REVERSION.lowSample).toBe(true)
  })

  it('splits a symbol with several setups', () => {
    const trades = [
      ...Array.from({ length: 3 }, () => makeTrade({ symbol: 'AAA', signal_type: 'MEAN_REVERSION' })),
      ...Array.from({ length: 6 }, () => makeTrade({ symbol: 'AAA', signal_type: 'TREND_PULLBACK' })),
    ]

    const [group] = groupBySymbol(trades)

    expect(group.summary.n).toBe(9)
    expect(group.bySetup.MEAN_REVERSION.n).toBe(3)
    expect(group.bySetup.MEAN_REVERSION.lowSample).toBe(true)
    expect(group.bySetup.TREND_PULLBACK.n).toBe(6)
    expect(group.bySetup.TREND_PULLBACK.lowSample).toBe(false)
  })

  it('maps a legacy null signal_type to UNKNOWN', () => {
    const trade = makeTrade({ symbol: 'AAA', signal_type: null })

    const [group] = groupBySymbol([trade])

    expect(Object.keys(group.bySetup)).toEqual(['UNKNOWN'])
  })

  it('sorts groups by trade count descending, then symbol ascending', () => {
    const trades = [
      makeTrade({ symbol: 'ZZZ' }),
      ...Array.from({ length: 2 }, () => makeTrade({ symbol: 'BBB' })),
      ...Array.from({ length: 2 }, () => makeTrade({ symbol: 'AAA' })),
    ]

    expect(groupBySymbol(trades).map((g) => g.symbol)).toEqual(['AAA', 'BBB', 'ZZZ'])
  })
})

describe('groupBySetup', () => {
  it('excludes a bucket below MIN_BUCKET_N and includes one at the threshold', () => {
    const makeFingerprintTrades = (n: number, bucketOverride: Partial<Fingerprint>) =>
      Array.from({ length: n }, () =>
        makeTrade({ signal_type: 'MEAN_REVERSION', stateFingerprint: makeFingerprint(bucketOverride) }),
      )

    const trades = [
      ...makeFingerprintTrades(7, { z_bucket: 'DEEP' }),
      ...makeFingerprintTrades(8, { z_bucket: 'MID' }),
    ]

    const [group] = groupBySetup(trades)

    expect(group.buckets.find((b) => b.dimension === 'z_bucket' && b.bucket === 'DEEP')).toBeUndefined()
    const mid = group.buckets.find((b) => b.dimension === 'z_bucket' && b.bucket === 'MID')
    expect(mid?.summary.n).toBe(8)
  })

  it('flags lowSample below LOW_SAMPLE_N and clears it at the threshold', () => {
    const makeFingerprintTrades = (n: number, bucketOverride: Partial<Fingerprint>) =>
      Array.from({ length: n }, () =>
        makeTrade({ signal_type: 'MEAN_REVERSION', stateFingerprint: makeFingerprint(bucketOverride) }),
      )

    const trades = [
      ...makeFingerprintTrades(19, { adx_bucket: 'LOW' }),
      ...makeFingerprintTrades(20, { adx_bucket: 'HIGH' }),
    ]

    const [group] = groupBySetup(trades)

    const low = group.buckets.find((b) => b.dimension === 'adx_bucket' && b.bucket === 'LOW')
    const high = group.buckets.find((b) => b.dimension === 'adx_bucket' && b.bucket === 'HIGH')
    expect(low?.summary.n).toBe(19)
    expect(low?.lowSample).toBe(true)
    expect(high?.summary.n).toBe(20)
    expect(high?.lowSample).toBe(false)
  })

  it('never combines two fingerprint dimensions into one bucket', () => {
    const trades = Array.from({ length: 8 }, () =>
      makeTrade({
        signal_type: 'MEAN_REVERSION',
        stateFingerprint: makeFingerprint({ adx_bucket: 'MID', macd_bucket: 'NEGATIVE' }),
      }),
    )

    const [group] = groupBySetup(trades)

    expect(group.buckets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ dimension: 'adx_bucket', bucket: 'MID' }),
        expect.objectContaining({ dimension: 'macd_bucket', bucket: 'NEGATIVE' }),
      ]),
    )
    expect(group.buckets.every((b) => !b.bucket.includes('|') && !b.bucket.includes(','))).toBe(true)
  })

  it('counts tradesWithFingerprint and treats a null stateFingerprint as contributing to no bucket', () => {
    const withFingerprint = Array.from({ length: 8 }, () =>
      makeTrade({ signal_type: 'MEAN_REVERSION', stateFingerprint: makeFingerprint({ adx_bucket: 'MID' }) }),
    )
    const withoutFingerprint = makeTrade({ signal_type: 'MEAN_REVERSION', stateFingerprint: null })

    const [group] = groupBySetup([...withFingerprint, withoutFingerprint])

    expect(group.summary.n).toBe(9)
    expect(group.tradesWithFingerprint).toBe(8)
  })

  it('maps a legacy null signal_type to UNKNOWN', () => {
    const trade = makeTrade({ signal_type: null })

    expect(groupBySetup([trade])[0].setup).toBe('UNKNOWN')
  })

  it('sorts setups by trade count descending', () => {
    const trades = [
      ...Array.from({ length: 1 }, () => makeTrade({ signal_type: 'EMA_RECLAIM' })),
      ...Array.from({ length: 3 }, () => makeTrade({ signal_type: 'MEAN_REVERSION' })),
    ]

    expect(groupBySetup(trades).map((g) => g.setup)).toEqual(['MEAN_REVERSION', 'EMA_RECLAIM'])
  })
})

describe('input immutability', () => {
  it('does not mutate the input array or its trade objects', () => {
    const trades = [
      makeTrade({ id: 't1', sellTimestamp: '2026-01-01T00:00:00Z' }),
      makeTrade({ id: 't2', sellTimestamp: '2026-02-01T00:00:00Z' }),
      makeTrade({ id: 't3', signal_type: null }),
    ]
    const snapshot = JSON.parse(JSON.stringify(trades))

    summarizeTrades(trades)
    buildTimeline(trades)
    groupBySymbol(trades)
    groupBySetup(trades)

    expect(JSON.parse(JSON.stringify(trades))).toEqual(snapshot)
  })
})

describe('clampTradesLimit', () => {
  it('defaults to 50 when the parameter is missing', () => {
    expect(clampTradesLimit(null)).toBe(50)
  })

  it('defaults to 50 when the parameter is invalid', () => {
    expect(clampTradesLimit('abc')).toBe(50)
    expect(clampTradesLimit('12.5')).toBe(50)
    expect(clampTradesLimit('')).toBe(50)
  })

  it('clamps a value below 1 up to 1', () => {
    expect(clampTradesLimit('0')).toBe(1)
    expect(clampTradesLimit('-5')).toBe(1)
  })

  it('clamps a value above 500 down to 500', () => {
    expect(clampTradesLimit('9999')).toBe(500)
    expect(clampTradesLimit('501')).toBe(500)
  })

  it('passes a valid in-range value through unchanged', () => {
    expect(clampTradesLimit('100')).toBe(100)
    expect(clampTradesLimit('1')).toBe(1)
    expect(clampTradesLimit('500')).toBe(500)
  })
})
