import type { TechnicalIndicators, TradeEvaluation } from './types'
import { MIN_BUCKET_N, type TradeSummary } from './trade-views'
import {
  buildBucketReports,
  buildSetupTrackRecords,
  getStatsSetupName,
  getTradeDimensionValue,
  type DimensionReport,
  type RuleVersionSegmentSummary,
  type SetupTrackRecord,
} from './pattern-stats'
import type { RuleVersionAxis, SetupName } from './pattern-schema'
import type { BucketLabel } from './pattern-labels'

// Sector relative strength was computed from stale bars before the macro-bars fix (c18a449, 2026-10-05).
// Commit time is not deploy time, so the cutoff is the first full trading day after it.
export const SECTOR_RS_RELIABLE_FROM = '2026-10-06T00:00:00-04:00'
export const MAX_BLOCK_LINES = 40
export const MAX_BLOCK_CHARS = 3000
export const MAX_LESSONS = 2
export const SAME_SYMBOL_HISTORY_COUNT = 3

// Lessons are free text written by Claude and may carry figures the module must not generate; such lessons are skipped whole.
const STATISTIC_LESSON_PATTERNS: readonly RegExp[] = [
  /\$\s?\d/,
  /\bwin[- ]?rate\b/i,
  /\bprofit[- ]factor\b/i,
  /\bsupported\b/i,
  /\bstrong(ly)?\b/i,
]

const FOOTER ='This block informs; it never gates entries.'
const LESSONS_HEADER = 'Lessons from single trades; hypotheses that may be wrong'

const LABEL_TEXT: Record<BucketLabel, string> = {
  INSUFFICIENT: 'too few trades',
  INCONCLUSIVE: 'inconclusive',
  DIFFERS_POS: 'differs (+)',
  DIFFERS_NEG: 'differs (-)',
}

export interface SetupLearningInput {
  setup: SetupName
  symbol: string
  indicators: TechnicalIndicators
  asOf: string
  trades: TradeEvaluation[]
}

export interface BucketShown { dimension: string; bucket: string; n: number }
export interface LessonShown { tradeId: string; symbol: string; setup: string }

export interface LearningSnapshot {
  version: 2
  setup: SetupName
  asOf: string
  text: string
  baseline: TradeSummary
  bucketsShown: BucketShown[]
  lessonsShown: LessonShown[]
  excludedLessonCount: number
  filteredLessonCount: number
}

interface MatchLine { line: string; shown: BucketShown; isExploratory: boolean }
interface LessonLine { line: string; shown: LessonShown }

const fmtPct = (n: number | null): string => (n === null ? 'n/a' : `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`)
const fmtRate = (n: number | null): string => (n === null ? 'n/a' : `${(n * 100).toFixed(0)}%`)
const fmtDate = (iso: string): string => iso.split('T')[0]
const timeOf = (iso: string): number => new Date(iso).getTime()
const bySellDesc = (a: TradeEvaluation, b: TradeEvaluation): number => timeOf(b.sellTimestamp) - timeOf(a.sellTimestamp)

function hasSectorRotation(trade: TradeEvaluation): boolean {
  const ind = trade.buyIndicators
  return 'sectorRotation' in ind && ind.sectorRotation != null
}

function isPreFixSectorTrade(trade: TradeEvaluation): boolean {
  if (!hasSectorRotation(trade)) return false
  const boughtAt = timeOf(trade.buyTimestamp)
  return Number.isNaN(boughtAt) || boughtAt < timeOf(SECTOR_RS_RELIABLE_FROM)
}

function latestSegment(record: SetupTrackRecord, axis: RuleVersionAxis): RuleVersionSegmentSummary | undefined {
  return record.ruleVersions
    .filter((r) => r.appliesTo === axis)
    .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))[0]
}

function ruleVersionLines(record: SetupTrackRecord): string[] {
  const entry = latestSegment(record, 'buy')
  const exit = latestSegment(record, 'sell')
  const lines: string[] = []
  if (entry) lines.push(`Entry rules (${entry.label}, since ${entry.effectiveDate}): n=${entry.after.n} bought under them`)
  if (exit) lines.push(`Exit rules (${exit.label}, since ${exit.effectiveDate}): n=${exit.after.n} sold under them`)
  return lines.length > 0 ? lines : [`Current rule version: n=${record.baseline.n} (no rule changes recorded)`]
}

function trackRecordLines(setup: SetupName, record: SetupTrackRecord): string[] {
  const b = record.baseline
  return [
    `SETUP TRACK RECORD (${setup}): n=${b.n}, win rate ${fmtRate(b.winRate)}, avg ${fmtPct(b.avgPnlPct)}, median ${fmtPct(b.medianPnlPct)}, worst ${fmtPct(b.worstPnlPct)}`,
    ...ruleVersionLines(record),
  ]
}

function candidateAsTrade(input: SetupLearningInput): TradeEvaluation {
  return {
    id: 'candidate',
    symbol: input.symbol,
    buyTimestamp: input.asOf,
    sellTimestamp: input.asOf,
    buyPrice: input.indicators.currentPrice,
    sellPrice: input.indicators.currentPrice,
    quantity: 0,
    pnlUSD: 0,
    pnlPct: 0,
    holdingDays: 0,
    signal_type: input.setup,
    stateFingerprint: null,
    buyIndicators: input.indicators,
    claudePostMortem: '',
    lessonsLearned: [],
    outcome: 'breakeven',
  }
}

function matchLineFor(report: DimensionReport, bucketValue: string): MatchLine | null {
  const bucket = report.buckets.find((b) => b.bucket === bucketValue)
  if (!bucket || bucket.summary.n < MIN_BUCKET_N) return null
  const isExploratory = report.kind === 'exploratory'
  const tag = isExploratory ? ' [exploratory]' : ''
  const line =
    `- ${report.dimension}=${bucket.bucket}${tag}: n=${bucket.summary.n}, avg ${fmtPct(bucket.summary.avgPnlPct)}, ` +
    `shrunk ${fmtPct(bucket.shrunkAvgPnl)}, ${LABEL_TEXT[bucket.label]}; setup baseline avg ${fmtPct(report.baseline.avgPnlPct)}`
  return { line, shown: { dimension: report.dimension, bucket: bucket.bucket, n: bucket.summary.n }, isExploratory }
}

function matchingConditions(input: SetupLearningInput): MatchLine[] {
  const candidate = candidateAsTrade(input)
  const lines: MatchLine[] = []
  for (const report of buildBucketReports(input.trades, input.setup)) {
    if (report.kind === 'diagnostic' || !report.viable) continue
    const value = getTradeDimensionValue(report.dimension, candidate, input.trades)
    const line = value === null ? null : matchLineFor(report, value)
    if (line) lines.push(line)
  }
  return [...lines.filter((l) => !l.isExploratory), ...lines.filter((l) => l.isExploratory)]
}

function sameSymbolLines(input: SetupLearningInput): string[] {
  const recent = input.trades.filter((t) => t.symbol === input.symbol).sort(bySellDesc).slice(0, SAME_SYMBOL_HISTORY_COUNT)
  if (recent.length === 0) return []
  return [
    `SAME-SYMBOL HISTORY (${input.symbol}, most recent closed trades):`,
    ...recent.map((t) => `- ${fmtDate(t.sellTimestamp)} ${t.signal_type ?? 'UNKNOWN'} ${fmtPct(t.pnlPct)}, held ${t.holdingDays}d`),
  ]
}

function isCleanLesson(text: string): boolean {
  return !STATISTIC_LESSON_PATTERNS.some((p) => p.test(text))
}

function collectLessons(setupTrades: TradeEvaluation[]): { lessons: LessonLine[]; excludedLessonCount: number; filteredLessonCount: number } {
  const withLessons = setupTrades.filter((t) => t.lessonsLearned.length > 0).sort(bySellDesc)
  const excludedLessonCount = withLessons.filter(isPreFixSectorTrade).length
  const lessons: LessonLine[] = []
  let filteredLessonCount = 0
  for (const t of withLessons.filter((x) => !isPreFixSectorTrade(x))) {
    const setupName = getStatsSetupName(t)
    for (const text of t.lessonsLearned) {
      if (!isCleanLesson(text)) {
        filteredLessonCount += 1
        continue
      }
      if (lessons.length === MAX_LESSONS) continue
      lessons.push({
        line: `- ${text} (${t.symbol} ${setupName} ${fmtDate(t.sellTimestamp)} ${fmtPct(t.pnlPct)})`,
        shown: { tradeId: t.id, symbol: t.symbol, setup: setupName },
      })
    }
  }
  return { lessons, excludedLessonCount, filteredLessonCount }
}

function render(head: string[], matches: MatchLine[], symbolLines: string[], lessons: LessonLine[]): string {
  const sections: string[][] = [
    head,
    matches.length > 0 ? ['MATCHING CONDITIONS (candidate bucket vs. setup history):', ...matches.map((m) => m.line)] : [],
    symbolLines,
    lessons.length > 0 ? [`${LESSONS_HEADER}:`, ...lessons.map((l) => l.line)] : [],
    [FOOTER],
  ]
  return sections.filter((s) => s.length > 0).flat().join('\n')
}

function fitsCaps(text: string): boolean {
  return text.length <= MAX_BLOCK_CHARS && text.split('\n').length <= MAX_BLOCK_LINES
}

export function buildSetupLearningBlock(input: SetupLearningInput): { text: string; snapshot: LearningSnapshot } {
  const records = buildSetupTrackRecords(input.trades)
  const record = records.find((r) => r.setup === input.setup) as SetupTrackRecord
  const setupTrades = input.trades.filter((t) => getStatsSetupName(t) === input.setup)
  const isEmptySetup = setupTrades.length === 0

  const head = isEmptySetup ? [`No closed trades for ${input.setup} yet.`] : trackRecordLines(input.setup, record)
  const allMatches = isEmptySetup ? [] : matchingConditions(input)
  const symbolLines = sameSymbolLines(input)
  const collected = isEmptySetup ? { lessons: [], excludedLessonCount: 0, filteredLessonCount: 0 } : collectLessons(setupTrades)

  let lessonCount = collected.lessons.length
  let matchCount = allMatches.length
  let text = render(head, allMatches.slice(0, matchCount), symbolLines, collected.lessons.slice(0, lessonCount))
  while (!fitsCaps(text) && (lessonCount > 0 || matchCount > 0)) {
    if (lessonCount > 0) lessonCount -= 1
    else matchCount -= 1
    text = render(head, allMatches.slice(0, matchCount), symbolLines, collected.lessons.slice(0, lessonCount))
  }

  const snapshot: LearningSnapshot = {
    version: 2,
    setup: input.setup,
    asOf: input.asOf,
    text,
    baseline: record.baseline,
    bucketsShown: allMatches.slice(0, matchCount).map((m) => m.shown),
    lessonsShown: collected.lessons.slice(0, lessonCount).map((l) => l.shown),
    excludedLessonCount: collected.excludedLessonCount,
    filteredLessonCount: collected.filteredLessonCount,
  }
  return { text, snapshot }
}

export function buildPatternIds(snapshot: LearningSnapshot): string[] {
  return snapshot.bucketsShown.map((b) => `${snapshot.setup}|${b.dimension}|${b.bucket}`)
}
