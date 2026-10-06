import type { TradeEvaluation } from './types'

export const MIN_BUCKET_N = 8
export const LOW_SAMPLE_N = 20
export const SYMBOL_SETUP_WARN_N = 5

export const DEFAULT_TRADES_LIMIT = 50
export const MIN_TRADES_LIMIT = 1
export const MAX_TRADES_LIMIT = 500

type FingerprintDimension = 'adx_bucket' | 'macd_bucket' | 'z_bucket' | 'atr_bucket' | 'market_regime'

// Excludes signal_type and spx_regime from stateFingerprint — groupBySetup already
// partitions by signal_type, and spx_regime is not part of the coarse-bucket spec.
const FINGERPRINT_DIMENSIONS: FingerprintDimension[] = [
  'adx_bucket',
  'macd_bucket',
  'z_bucket',
  'atr_bucket',
  'market_regime',
]

const FINGERPRINT_CHIP_PREFIX: Record<FingerprintDimension, string> = {
  adx_bucket: 'adx',
  macd_bucket: 'macd',
  z_bucket: 'z',
  atr_bucket: 'atr',
  market_regime: 'regime',
}

export interface TradeSummary {
  n: number
  wins: number
  winRate: number | null
  avgPnlPct: number | null
  medianPnlPct: number | null
  worstPnlPct: number | null
  bestPnlPct: number | null
}

export interface TimelineEntry {
  id: string
  symbol: string
  setup: string
  buyTimestamp: string
  sellTimestamp: string
  buyPrice: number
  sellPrice: number
  pnlPct: number
  pnlUSD: number
  holdingDays: number
  outcome: TradeEvaluation['outcome']
  lessons: string[]
  fingerprintChips: string[]
}

export interface SymbolSetupSummary extends TradeSummary {
  lowSample: boolean
}

export interface SymbolGroup {
  symbol: string
  summary: TradeSummary
  bySetup: Record<string, SymbolSetupSummary>
  trades: TradeEvaluation[]
}

export interface FingerprintBucket {
  dimension: FingerprintDimension
  bucket: string
  summary: TradeSummary
  lowSample: boolean
}

export interface SetupGroup {
  setup: string
  summary: TradeSummary
  tradesWithFingerprint: number
  buckets: FingerprintBucket[]
}

function getSetupName(trade: TradeEvaluation): string {
  return trade.signal_type ?? 'UNKNOWN'
}

function sellTimestampDescThenId(a: TradeEvaluation, b: TradeEvaluation): number {
  const diff = new Date(b.sellTimestamp).getTime() - new Date(a.sellTimestamp).getTime()
  if (diff !== 0) return diff
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

export function summarizeTrades(trades: TradeEvaluation[]): TradeSummary {
  const n = trades.length
  if (n === 0) {
    return { n: 0, wins: 0, winRate: null, avgPnlPct: null, medianPnlPct: null, worstPnlPct: null, bestPnlPct: null }
  }

  const wins = trades.filter((t) => t.outcome === 'profit').length
  const sortedPnlPct = trades.map((t) => t.pnlPct).sort((a, b) => a - b)
  const mid = Math.floor(n / 2)
  const medianPnlPct = n % 2 === 0 ? (sortedPnlPct[mid - 1] + sortedPnlPct[mid]) / 2 : sortedPnlPct[mid]
  const avgPnlPct = sortedPnlPct.reduce((sum, pct) => sum + pct, 0) / n

  return {
    n,
    wins,
    winRate: wins / n,
    avgPnlPct,
    medianPnlPct,
    worstPnlPct: sortedPnlPct[0],
    bestPnlPct: sortedPnlPct[n - 1],
  }
}

function buildFingerprintChips(stateFingerprint: TradeEvaluation['stateFingerprint']): string[] {
  if (!stateFingerprint) return []
  const chips: string[] = []
  for (const dimension of FINGERPRINT_DIMENSIONS) {
    const value = stateFingerprint[dimension]
    if (value != null) chips.push(`${FINGERPRINT_CHIP_PREFIX[dimension]}:${value}`)
  }
  return chips
}

export function buildTimeline(trades: TradeEvaluation[]): TimelineEntry[] {
  return [...trades]
    .sort(sellTimestampDescThenId)
    .map((trade) => ({
      id: trade.id,
      symbol: trade.symbol,
      setup: getSetupName(trade),
      buyTimestamp: trade.buyTimestamp,
      sellTimestamp: trade.sellTimestamp,
      buyPrice: trade.buyPrice,
      sellPrice: trade.sellPrice,
      pnlPct: trade.pnlPct,
      pnlUSD: trade.pnlUSD,
      holdingDays: trade.holdingDays,
      outcome: trade.outcome,
      lessons: trade.lessonsLearned ?? [],
      fingerprintChips: buildFingerprintChips(trade.stateFingerprint),
    }))
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

export function groupBySymbol(trades: TradeEvaluation[]): SymbolGroup[] {
  const groups = Array.from(groupBy(trades, (t) => t.symbol).entries()).map(([symbol, symbolTrades]) => {
    const bySetup: Record<string, SymbolSetupSummary> = {}
    for (const [setup, setupTrades] of groupBy(symbolTrades, getSetupName)) {
      const summary = summarizeTrades(setupTrades)
      bySetup[setup] = { ...summary, lowSample: summary.n < SYMBOL_SETUP_WARN_N }
    }

    return {
      symbol,
      summary: summarizeTrades(symbolTrades),
      bySetup,
      trades: [...symbolTrades].sort((a, b) => new Date(b.sellTimestamp).getTime() - new Date(a.sellTimestamp).getTime()),
    }
  })

  return groups.sort((a, b) => b.summary.n - a.summary.n || (a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0))
}

function buildFingerprintBuckets(setupTrades: TradeEvaluation[]): FingerprintBucket[] {
  const buckets: FingerprintBucket[] = []

  for (const dimension of FINGERPRINT_DIMENSIONS) {
    const tradesWithValue = setupTrades.filter((t) => t.stateFingerprint?.[dimension] != null)
    const byBucketValue = groupBy(tradesWithValue, (t) => t.stateFingerprint![dimension] as string)

    for (const [bucket, bucketTrades] of byBucketValue) {
      if (bucketTrades.length < MIN_BUCKET_N) continue
      buckets.push({
        dimension,
        bucket,
        summary: summarizeTrades(bucketTrades),
        lowSample: bucketTrades.length < LOW_SAMPLE_N,
      })
    }
  }

  return buckets.sort((a, b) => {
    if (a.dimension !== b.dimension) return a.dimension < b.dimension ? -1 : 1
    return b.summary.n - a.summary.n
  })
}

export function groupBySetup(trades: TradeEvaluation[]): SetupGroup[] {
  const groups = Array.from(groupBy(trades, getSetupName).entries()).map(([setup, setupTrades]) => ({
    setup,
    summary: summarizeTrades(setupTrades),
    tradesWithFingerprint: setupTrades.filter((t) => t.stateFingerprint != null).length,
    buckets: buildFingerprintBuckets(setupTrades),
  }))

  return groups.sort((a, b) => b.summary.n - a.summary.n)
}

export function clampTradesLimit(raw: string | null): number {
  if (raw == null || raw.trim() === '') return DEFAULT_TRADES_LIMIT
  const parsed = Number(raw)
  if (!Number.isInteger(parsed)) return DEFAULT_TRADES_LIMIT
  return Math.min(Math.max(parsed, MIN_TRADES_LIMIT), MAX_TRADES_LIMIT)
}
