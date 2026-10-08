import { describe, it, expect } from 'vitest'
import type { TradeEvaluation, TechnicalIndicators } from '../types'
import {
  getPatternStats,
  buildSetupTrackRecords,
  buildBucketReports,
  resolveFingerprint,
  computeEma50ExtensionBucket,
  computeDrop3dBucket,
  computeReentryBucket,
} from '../pattern-stats'

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
    kalman: { stateEstimate: 100, forecastError: 0, errorStdDev: 1, zScore: 0.5, signal: 'NEUTRAL' },
    currentPrice: 100,
    volume: 0,
    prevDayVolume: 0,
    adx: 20,
    atr: null,
    atrPercentile: 0.5,
    marketRegime: 'TRENDING',
    ...overrides,
  }
}

function makeTrade(overrides: Partial<TradeEvaluation> = {}): TradeEvaluation {
  nextId += 1
  return {
    id: `trade-${nextId}`,
    symbol: 'AAPL',
    buyTimestamp: '2026-01-01T14:00:00-04:00',
    sellTimestamp: '2026-01-05T14:00:00-04:00',
    buyPrice: 100,
    sellPrice: 105,
    quantity: 10,
    pnlUSD: 50,
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

describe('resolveFingerprint', () => {
  it('prefers the stored fingerprint when present', () => {
    const trade = makeTrade({
      stateFingerprint: {
        signal_type: 'MEAN_REVERSION', spx_regime: 'BULL', market_regime: 'RANGING',
        adx_bucket: 'LOW', z_bucket: 'DEEP', macd_bucket: 'NEGATIVE', atr_bucket: 'MID',
      },
      buyIndicators: makeIndicators({ adx: 99, marketRegime: 'TRENDING' }),
    })

    const fp = resolveFingerprint(trade)

    expect(fp.source).toBe('stored')
    expect(fp.adx_bucket).toBe('LOW')
    expect(fp.market_regime).toBe('RANGING')
  })

  it('recomputes from buyIndicators when no stored fingerprint is present', () => {
    const trade = makeTrade({
      stateFingerprint: null,
      signal_type: 'MEAN_REVERSION',
      buyIndicators: makeIndicators({ adx: 10, marketRegime: 'RANGING', kalman: { stateEstimate: 0, forecastError: 0, errorStdDev: 1, zScore: -1.6, signal: 'NEUTRAL' } }),
    })

    const fp = resolveFingerprint(trade)

    expect(fp.source).toBe('recomputed')
    expect(fp.adx_bucket).toBe('LOW')
    expect(fp.z_bucket).toBe('DEEP')
    expect(fp.market_regime).toBe('RANGING')
  })

  it('returns source missing with all-null buckets when no inputs are available at all', () => {
    const trade = makeTrade({
      stateFingerprint: null,
      buyIndicators: makeIndicators({ adx: null, atrPercentile: null, macd: null, kalman: null, marketRegime: null }),
    })

    const fp = resolveFingerprint(trade)

    expect(fp.source).toBe('missing')
    expect(fp.adx_bucket).toBeNull()
    expect(fp.z_bucket).toBeNull()
  })
})

describe('computeEma50ExtensionBucket', () => {
  it('buckets LOW/MID/HIGH by percent extension above ema50', () => {
    expect(computeEma50ExtensionBucket(makeTrade({ buyIndicators: makeIndicators({ ema50: 100, currentPrice: 101 }) }))).toBe('LOW')
    expect(computeEma50ExtensionBucket(makeTrade({ buyIndicators: makeIndicators({ ema50: 100, currentPrice: 103 }) }))).toBe('MID')
    expect(computeEma50ExtensionBucket(makeTrade({ buyIndicators: makeIndicators({ ema50: 100, currentPrice: 106 }) }))).toBe('HIGH')
  })

  it('returns null when ema50 is unavailable', () => {
    expect(computeEma50ExtensionBucket(makeTrade({ buyIndicators: makeIndicators({ ema50: null }) }))).toBeNull()
  })
})

describe('computeDrop3dBucket', () => {
  it('buckets SHALLOW/MID/DEEP by percent decline from closeMinus3 to prevClose', () => {
    expect(computeDrop3dBucket(makeTrade({ buyIndicators: makeIndicators({ closeMinus3: 100, prevClose: 99 }) }))).toBe('SHALLOW')
    expect(computeDrop3dBucket(makeTrade({ buyIndicators: makeIndicators({ closeMinus3: 100, prevClose: 95 }) }))).toBe('MID')
    expect(computeDrop3dBucket(makeTrade({ buyIndicators: makeIndicators({ closeMinus3: 100, prevClose: 90 }) }))).toBe('DEEP')
  })

  it('returns null when prevClose/closeMinus3 are unavailable', () => {
    expect(computeDrop3dBucket(makeTrade({ buyIndicators: makeIndicators({ closeMinus3: undefined, prevClose: undefined }) }))).toBeNull()
  })
})

describe('computeReentryBucket', () => {
  it('returns FIRST when no prior same-symbol trade closed before this buy', () => {
    const trade = makeTrade({ symbol: 'ZZZ', buyTimestamp: '2026-02-01T00:00:00-04:00' })

    expect(computeReentryBucket(trade, [trade])).toBe('FIRST')
  })

  it('returns WITHIN_7D / 8_30D / OVER_30D based on days since the most recent prior sell', () => {
    const base = '2026-03-01T00:00:00-04:00'
    const makeReentryCase = (daysAgo: number) => {
      const prior = makeTrade({ symbol: 'ZZZ', sellTimestamp: new Date(new Date(base).getTime() - daysAgo * 86_400_000).toISOString() })
      const current = makeTrade({ symbol: 'ZZZ', buyTimestamp: base })
      return computeReentryBucket(current, [prior, current])
    }

    expect(makeReentryCase(3)).toBe('WITHIN_7D')
    expect(makeReentryCase(15)).toBe('8_30D')
    expect(makeReentryCase(45)).toBe('OVER_30D')
  })
})

describe('buildBucketReports — viability', () => {
  it('flags a dimension not viable when nearly all trades share one bucket (26 of 28)', () => {
    const positive = Array.from({ length: 26 }, () =>
      makeTrade({ signal_type: 'TREND_ZLE05', buyIndicators: makeIndicators({ macd: { macdLine: 0, signalLine: 0, histogram: 1 } }) })
    )
    const negative = Array.from({ length: 2 }, () =>
      makeTrade({ signal_type: 'TREND_ZLE05', buyIndicators: makeIndicators({ macd: { macdLine: 0, signalLine: 0, histogram: -0.5 } }) })
    )

    const reports = buildBucketReports([...positive, ...negative], 'TREND_ZLE05')
    const macdReport = reports.find((r) => r.dimension === 'macd_bucket')!

    expect(macdReport.viable).toBe(false)
    expect(macdReport.reason).toContain('26 of 28')
  })

  it('marks a dimension viable when at least two buckets reach MIN_BUCKET_N', () => {
    const low = Array.from({ length: 10 }, () => makeTrade({ signal_type: 'MEAN_REVERSION', buyIndicators: makeIndicators({ adx: 10 }) }))
    const high = Array.from({ length: 9 }, () => makeTrade({ signal_type: 'MEAN_REVERSION', buyIndicators: makeIndicators({ adx: 30 }) }))

    const reports = buildBucketReports([...low, ...high], 'MEAN_REVERSION')
    const adxReport = reports.find((r) => r.dimension === 'adx_bucket')!

    expect(adxReport.viable).toBe(true)
    expect(adxReport.buckets.map((b) => b.bucket).sort()).toEqual(['HIGH', 'LOW'])
  })
})

describe('buildBucketReports — forward/historical split and verdict', () => {
  it('returns PENDING when the forward group has fewer than 5 trades', () => {
    const historical = Array.from({ length: 10 }, () =>
      makeTrade({ signal_type: 'MEAN_REVERSION', buyTimestamp: '2026-01-01T00:00:00-04:00', pnlPct: 10, buyIndicators: makeIndicators({ adx: 10 }) })
    )
    const otherBucket = Array.from({ length: 10 }, () =>
      makeTrade({ signal_type: 'MEAN_REVERSION', buyTimestamp: '2026-01-01T00:00:00-04:00', pnlPct: -10, buyIndicators: makeIndicators({ adx: 30 }) })
    )
    const forward = [makeTrade({ signal_type: 'MEAN_REVERSION', buyTimestamp: '2026-10-09T00:00:00-04:00', pnlPct: 10, buyIndicators: makeIndicators({ adx: 10 }) })]

    const reports = buildBucketReports([...historical, ...otherBucket, ...forward], 'MEAN_REVERSION')
    const adxReport = reports.find((r) => r.dimension === 'adx_bucket')!
    const lowBucket = adxReport.buckets.find((b) => b.bucket === 'LOW')!

    expect(lowBucket.forwardVerdict).toBe('PENDING')
  })
})

describe('buildSetupTrackRecords — fingerprint coverage and rule versions', () => {
  it('reports fingerprint coverage split by source', () => {
    const stored = makeTrade({
      signal_type: 'MEAN_REVERSION',
      stateFingerprint: { signal_type: 'MEAN_REVERSION', spx_regime: null, market_regime: null, adx_bucket: 'LOW', z_bucket: null, macd_bucket: null, atr_bucket: null },
    })
    const recomputed = makeTrade({ signal_type: 'MEAN_REVERSION', stateFingerprint: null, buyIndicators: makeIndicators({ adx: 10 }) })
    const missing = makeTrade({
      signal_type: 'MEAN_REVERSION',
      stateFingerprint: null,
      buyIndicators: makeIndicators({ adx: null, atrPercentile: null, macd: null, kalman: null, marketRegime: null }),
    })

    const [record] = buildSetupTrackRecords([stored, recomputed, missing]).filter((r) => r.setup === 'MEAN_REVERSION')

    expect(record.fingerprintCoverage).toEqual({ stored: 1, recomputed: 1, missing: 1 })
  })

  it('classifies a TREND_ZLE05 trade independently by buy-axis and sell-axis rule-version boundaries', () => {
    const trade = makeTrade({
      signal_type: 'TREND_ZLE05',
      buyTimestamp: '2026-07-01T00:00:00-04:00', // after the 2026-06-04 buy boundary
      sellTimestamp: '2026-07-10T00:00:00-04:00', // before the 2026-10-05 sell boundary
    })

    const [record] = buildSetupTrackRecords([trade]).filter((r) => r.setup === 'TREND_ZLE05')
    const buyBoundary = record.ruleVersions.find((v) => v.appliesTo === 'buy')!
    const sellBoundary = record.ruleVersions.find((v) => v.appliesTo === 'sell')!

    expect(buyBoundary.after.n).toBe(1)
    expect(buyBoundary.before.n).toBe(0)
    expect(sellBoundary.before.n).toBe(1)
    expect(sellBoundary.after.n).toBe(0)
  })

  it('groups unrecognized/null signal_type under UNKNOWN in the baseline only', () => {
    const legacy = makeTrade({ signal_type: 'TREND' })
    const nullish = makeTrade({ signal_type: null })

    const records = buildSetupTrackRecords([legacy, nullish])
    const unknown = records.find((r) => r.setup === 'UNKNOWN')!

    expect(unknown.baseline.n).toBe(2)
  })
})

describe('confidence_bucket — structurally unavailable', () => {
  it('is reported as skipped for every setup', () => {
    const trades = [makeTrade({ signal_type: 'MEAN_REVERSION' })]
    const stats = getPatternStats(trades)

    for (const dimensions of Object.values(stats.buckets)) {
      const confidence = dimensions.find((d) => d.dimension === 'confidence_bucket')
      expect(confidence?.skipped).toBe(true)
      expect(confidence?.reason).toBe('missing field confidence')
    }
  })
})

describe('getPatternStats — purity and output shape', () => {
  it('never rescales pnlPct', () => {
    const trades = Array.from({ length: 10 }, () => makeTrade({ signal_type: 'MEAN_REVERSION', pnlPct: 7.25, buyIndicators: makeIndicators({ adx: 10 }) }))

    const reports = buildBucketReports(trades, 'MEAN_REVERSION')
    const adxReport = reports.find((r) => r.dimension === 'adx_bucket')!
    // not viable with a single bucket, so assert via the dimension baseline instead
    expect(adxReport.baseline.avgPnlPct).toBe(7.25)
  })

  it('contains no dollar-denominated field anywhere in its output', () => {
    const trades = [makeTrade({ signal_type: 'MEAN_REVERSION' })]
    const json = JSON.stringify(getPatternStats(trades))

    expect(json).not.toContain('pnlUSD')
    expect(json).not.toContain('profitFactor')
  })

  it('does not mutate the input trades array or its elements', () => {
    const trades = [
      makeTrade({ signal_type: 'MEAN_REVERSION' }),
      makeTrade({ signal_type: 'TREND_ZLE05' }),
      makeTrade({ signal_type: null }),
    ]
    const snapshot = JSON.parse(JSON.stringify(trades))

    getPatternStats(trades)
    buildSetupTrackRecords(trades)
    buildBucketReports(trades, 'MEAN_REVERSION')

    expect(JSON.parse(JSON.stringify(trades))).toEqual(snapshot)
  })
})
