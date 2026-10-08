import type { TradeEvaluation } from './types'
import { summarizeTrades, MIN_BUCKET_N, type TradeSummary } from './trade-views'
import { getAdxBucket, getMacdBucket, getAtrBucket, getZBucket } from './state-fingerprint'
import {
  SCHEMA,
  SCHEMA_FROZEN_AT,
  RULE_VERSION_BOUNDARIES,
  MULTIPLE_COMPARISONS_NOTE,
  type SetupName,
  type DimensionKind,
  type DimensionSchemaEntry,
  type RuleVersionAxis,
} from './pattern-schema'
import { confidenceInterval95, shrink, labelBucket, type BucketLabel, type ConfidenceInterval } from './pattern-labels'

const ALL_SETUPS: SetupName[] = ['MEAN_REVERSION', 'TREND_PULLBACK', 'TREND_ZLE05', 'TREND_PULLBACK_3DAY', 'EMA_RECLAIM']

export type SetupKey = SetupName | 'UNKNOWN'

export function getStatsSetupName(trade: TradeEvaluation): SetupKey {
  const s = trade.signal_type
  return s === 'MEAN_REVERSION' || s === 'TREND_PULLBACK' || s === 'TREND_ZLE05' || s === 'TREND_PULLBACK_3DAY' || s === 'EMA_RECLAIM' ? s : 'UNKNOWN'
}

function groupBy<T, K>(items: T[], keyOf: (item: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>()
  for (const item of items) {
    const key = keyOf(item)
    const group = groups.get(key)
    if (group) group.push(item)
    else groups.set(key, [item])
  }
  return groups
}

export type FingerprintSource = 'stored' | 'recomputed' | 'missing'

export interface ResolvedFingerprint {
  source: FingerprintSource
  adx_bucket: string | null; z_bucket: string | null; macd_bucket: string | null
  atr_bucket: string | null; market_regime: string | null
}

function recomputeFingerprint(trade: TradeEvaluation): ResolvedFingerprint | null {
  const ind = trade.buyIndicators
  if (!ind) return null

  const setup = getStatsSetupName(trade)
  const zSignalType = setup === 'UNKNOWN' ? null : setup
  const adx = typeof ind.adx === 'number' ? ind.adx : null
  const atrPercentile = typeof ind.atrPercentile === 'number' ? ind.atrPercentile : null
  const macdHistogram = typeof ind.macd?.histogram === 'number' ? ind.macd.histogram : null
  const zScore = typeof ind.kalman?.zScore === 'number' ? ind.kalman.zScore : null
  const marketRegime = ind.marketRegime ?? null

  const hasAnyInput = adx !== null || atrPercentile !== null || macdHistogram !== null || zScore !== null || marketRegime !== null
  if (!hasAnyInput) return null

  return {
    source: 'recomputed',
    adx_bucket: getAdxBucket(adx),
    z_bucket: getZBucket(zScore, zSignalType),
    macd_bucket: getMacdBucket(macdHistogram),
    atr_bucket: getAtrBucket(atrPercentile),
    market_regime: marketRegime,
  }
}

export function resolveFingerprint(trade: TradeEvaluation): ResolvedFingerprint {
  const stored = trade.stateFingerprint
  if (stored) {
    return {
      source: 'stored',
      adx_bucket: stored.adx_bucket,
      z_bucket: stored.z_bucket,
      macd_bucket: stored.macd_bucket,
      atr_bucket: stored.atr_bucket ?? null,
      market_regime: stored.market_regime,
    }
  }

  return (
    recomputeFingerprint(trade) ?? {
      source: 'missing',
      adx_bucket: null,
      z_bucket: null,
      macd_bucket: null,
      atr_bucket: null,
      market_regime: null,
    }
  )
}

export function computeEma50ExtensionBucket(trade: TradeEvaluation): string | null {
  const ema50 = trade.buyIndicators?.ema50
  const currentPrice = trade.buyIndicators?.currentPrice
  if (ema50 == null || ema50 === 0 || currentPrice == null) return null
  const pct = ((currentPrice - ema50) / ema50) * 100
  if (pct < 2) return 'LOW'
  if (pct < 5) return 'MID'
  return 'HIGH'
}

export function computeDrop3dBucket(trade: TradeEvaluation): string | null {
  const prevClose = trade.buyIndicators?.prevClose
  const closeMinus3 = trade.buyIndicators?.closeMinus3
  if (prevClose == null || closeMinus3 == null || closeMinus3 === 0) return null
  const pct = ((closeMinus3 - prevClose) / closeMinus3) * 100
  if (pct < 3) return 'SHALLOW'
  if (pct < 6) return 'MID'
  return 'DEEP'
}

const DAY_MS = 24 * 60 * 60 * 1000

export function computeReentryBucket(trade: TradeEvaluation, allTrades: TradeEvaluation[]): string {
  const priorSellTimestamps = allTrades
    .filter((t) => t.symbol === trade.symbol && t.id !== trade.id && t.sellTimestamp < trade.buyTimestamp)
    .map((t) => t.sellTimestamp)

  if (priorSellTimestamps.length === 0) return 'FIRST'

  const mostRecentSell = [...priorSellTimestamps].sort().at(-1) as string
  const days = (new Date(trade.buyTimestamp).getTime() - new Date(mostRecentSell).getTime()) / DAY_MS

  if (days <= 7) return 'WITHIN_7D'
  if (days <= 30) return '8_30D'
  return 'OVER_30D'
}

function getDimensionValue(dimension: string, trade: TradeEvaluation, allTrades: TradeEvaluation[]): string | null {
  switch (dimension) {
    case 'adx_bucket': return resolveFingerprint(trade).adx_bucket
    case 'z_bucket': return resolveFingerprint(trade).z_bucket
    case 'macd_bucket': return resolveFingerprint(trade).macd_bucket
    case 'atr_bucket': return resolveFingerprint(trade).atr_bucket
    case 'market_regime': return resolveFingerprint(trade).market_regime
    case 'ema50_extension_bucket': return computeEma50ExtensionBucket(trade)
    case 'drop3d_bucket': return computeDrop3dBucket(trade)
    case 'reentry_bucket': return computeReentryBucket(trade, allTrades)
    default: return null
  }
}

function signOf(n: number): number {
  return n > 0 ? 1 : n < 0 ? -1 : 0
}

export interface BucketReport {
  bucket: string; summary: TradeSummary; shrunkAvgPnl: number; ci95: ConfidenceInterval; label: BucketLabel
  historical: TradeSummary; forward: TradeSummary; forwardVerdict: 'PENDING' | 'CONSISTENT' | 'CONTRADICTED'
}

function buildBucketReport(
  bucketTrades: TradeEvaluation[], bucket: string,
  setupBaseline: TradeSummary, setupHistoricalBaseline: TradeSummary, setupForwardBaseline: TradeSummary
): BucketReport {
  const summary = summarizeTrades(bucketTrades)
  const ci95 = confidenceInterval95(bucketTrades.map((t) => t.pnlPct))
  const baselineAvg = setupBaseline.avgPnlPct ?? 0
  const shrunkAvgPnl = shrink(summary.avgPnlPct ?? 0, summary.n, baselineAvg)
  const label = labelBucket(ci95, baselineAvg, summary.n)

  const historicalTrades = bucketTrades.filter((t) => t.buyTimestamp < SCHEMA_FROZEN_AT)
  const forwardTrades = bucketTrades.filter((t) => t.buyTimestamp >= SCHEMA_FROZEN_AT)
  const historical = summarizeTrades(historicalTrades)
  const forward = summarizeTrades(forwardTrades)

  const historicalDiff = (historical.avgPnlPct ?? 0) - (setupHistoricalBaseline.avgPnlPct ?? 0)
  const forwardDiff = (forward.avgPnlPct ?? 0) - (setupForwardBaseline.avgPnlPct ?? 0)
  const forwardVerdict =
    forward.n < 5 ? 'PENDING' : signOf(historicalDiff) === signOf(forwardDiff) ? 'CONSISTENT' : 'CONTRADICTED'

  return { bucket, summary, shrunkAvgPnl, ci95, label, historical, forward, forwardVerdict }
}

export interface DimensionReport {
  dimension: string; kind: DimensionKind; skipped: boolean; reason?: string
  viable: boolean; baseline: TradeSummary; buckets: BucketReport[]
}

function emptyDimensionReport(
  entry: DimensionSchemaEntry, baseline: TradeSummary, reason: string | undefined, skipped: boolean
): DimensionReport {
  return { dimension: entry.dimension, kind: entry.kind, skipped, reason, viable: false, baseline, buckets: [] }
}

export function buildBucketReports(trades: TradeEvaluation[], setup: SetupName): DimensionReport[] {
  const setupTrades = trades.filter((t) => getStatsSetupName(t) === setup)
  const setupBaseline = summarizeTrades(setupTrades)
  const setupHistoricalBaseline = summarizeTrades(setupTrades.filter((t) => t.buyTimestamp < SCHEMA_FROZEN_AT))
  const setupForwardBaseline = summarizeTrades(setupTrades.filter((t) => t.buyTimestamp >= SCHEMA_FROZEN_AT))

  return SCHEMA[setup].map((entry): DimensionReport => {
    if (entry.dimension === 'confidence_bucket') {
      return emptyDimensionReport(entry, setupBaseline, 'missing field confidence', true)
    }

    const valueByTradeId = new Map<string, string | null>(
      setupTrades.map((t) => [t.id, getDimensionValue(entry.dimension, t, trades)])
    )
    const availableTrades = setupTrades.filter((t) => valueByTradeId.get(t.id) != null)
    if (availableTrades.length === 0) {
      return emptyDimensionReport(entry, setupBaseline, `missing field ${entry.dimension}`, true)
    }

    const byBucket = groupBy(availableTrades, (t) => valueByTradeId.get(t.id) as string)
    const sortedBuckets = [...byBucket.entries()].sort((a, b) => b[1].length - a[1].length)
    const viable = sortedBuckets.filter(([, g]) => g.length >= MIN_BUCKET_N).length >= 2
    if (!viable) {
      const [dominantBucket, dominantTrades] = sortedBuckets[0] ?? ['(none)', []]
      const reason = `no contrast: ${dominantTrades.length} of ${availableTrades.length} trades in bucket "${dominantBucket}"`
      return emptyDimensionReport(entry, setupBaseline, reason, false)
    }

    return {
      dimension: entry.dimension,
      kind: entry.kind,
      skipped: false,
      viable: true,
      baseline: setupBaseline,
      buckets: sortedBuckets.map(([bucket, bucketTrades]) =>
        buildBucketReport(bucketTrades, bucket, setupBaseline, setupHistoricalBaseline, setupForwardBaseline)
      ),
    }
  })
}

export interface FingerprintCoverage { stored: number; recomputed: number; missing: number }

export interface RuleVersionSegmentSummary {
  label: string; appliesTo: RuleVersionAxis; effectiveDate: string; before: TradeSummary; after: TradeSummary
}

export interface SetupTrackRecord {
  setup: SetupKey; baseline: TradeSummary; fingerprintCoverage: FingerprintCoverage; ruleVersions: RuleVersionSegmentSummary[]
}

export function buildSetupTrackRecords(trades: TradeEvaluation[]): SetupTrackRecord[] {
  const bySetup = groupBy(trades, getStatsSetupName)
  const keys: SetupKey[] = [...ALL_SETUPS, 'UNKNOWN']

  return keys.map((setup): SetupTrackRecord => {
    const setupTrades = bySetup.get(setup) ?? []
    const baseline = summarizeTrades(setupTrades)

    const fingerprintCoverage: FingerprintCoverage = { stored: 0, recomputed: 0, missing: 0 }
    for (const t of setupTrades) {
      fingerprintCoverage[resolveFingerprint(t).source]++
    }

    const boundaries = setup === 'UNKNOWN' ? [] : RULE_VERSION_BOUNDARIES[setup]
    const ruleVersions: RuleVersionSegmentSummary[] = boundaries.map((b) => {
      const key: 'buyTimestamp' | 'sellTimestamp' = b.appliesTo === 'buy' ? 'buyTimestamp' : 'sellTimestamp'
      return {
        label: b.label,
        appliesTo: b.appliesTo,
        effectiveDate: b.effectiveDate,
        before: summarizeTrades(setupTrades.filter((t) => t[key] < b.effectiveDate)),
        after: summarizeTrades(setupTrades.filter((t) => t[key] >= b.effectiveDate)),
      }
    })

    return { setup, baseline, fingerprintCoverage, ruleVersions }
  })
}

export interface PatternStats {
  schema: typeof SCHEMA; multipleComparisonsNote: string; setups: SetupTrackRecord[]; buckets: Record<SetupName, DimensionReport[]>
}

export function getPatternStats(trades: TradeEvaluation[]): PatternStats {
  const buckets = {} as Record<SetupName, DimensionReport[]>
  for (const setup of ALL_SETUPS) {
    buckets[setup] = buildBucketReports(trades, setup)
  }

  return {
    schema: SCHEMA,
    multipleComparisonsNote: MULTIPLE_COMPARISONS_NOTE,
    setups: buildSetupTrackRecords(trades),
    buckets,
  }
}
