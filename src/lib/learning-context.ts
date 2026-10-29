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
import { buildEarningsPromptLine, type EarningsFlag } from './earnings-window'

// Sector relative strength was computed from stale bars before the macro-bars fix (c18a449, 2026-10-05).
// Commit time is not deploy time, so the cutoff is the first full trading day after it.
export const SECTOR_RS_RELIABLE_FROM = '2026-10-06T00:00:00-04:00'
export const MAX_BLOCK_LINES = 40
export const MAX_BLOCK_CHARS = 3000
export const MAX_LESSONS = 2
export const SAME_SYMBOL_HISTORY_COUNT = 3

// Switches. Three, false, true restore the pre-change block (the "strong/strongly" fix is not switchable).
export const LESSONS_PER_TRADE = 1
export const HARD_RULE_FILTER_ENABLED = true
export const SHOW_EXPLORATORY_BUCKETS = false

// Lessons are free text written by Claude and may carry figures the module must not generate; such lessons are skipped whole.
const STATISTIC_LESSON_PATTERNS: readonly RegExp[] = [
  /\$\s?\d/,
  /\bwin[- ]?rate\b/i,
  /\bprofit[- ]factor\b/i,
  /\bsupported\b/i,
]

// Strong tier: explicit prohibition or veto wording. Such lessons read as rules, which this block must not carry.
export const HARD_RULE_LESSON_PATTERNS: readonly RegExp[] = [
  /\bhard[- ](filter|veto|gate|block|stop|stops|rule|pass)\b/i,
  /\bveto\b/i,
  /\bdisqualif\w*/i,
  /\bnever\s+(enter|execute|initiate|apply|override|open|take)\b/i,
  /\b(do not|don't)\s+(enter|execute|take|open|initiate)\b/i,
  /\bavoid\s+(entering|initiating|trend|taking|entries)\b/i,
  /\b(must not|should never|must never)\b/i,
  /\b(should|must)\s+(be\s+)?(automatically\s+)?(rejected|skipped|disabled|suppressed)\b|\bblocked or deferred\b|\bshould (have been )?blocked\b|\bautomatically (disqualified|rejected)\b/i,
]

// A match inside a negation ("not a hard gate", "should not be blocked") only discusses a rule and is kept.
const NEGATION_BEFORE_MATCH = /\b(not|n't|no longer|rather than|without|nor|cannot|should not|does not|did not)\b[^.;—]{0,45}$/i
const NEGATION_LOOKBACK_CHARS = 60
const IMPERATIVE_MATCH_START = /^(never|do not|don't|must not|should never|must never|avoid)/i

const FOOTER ='This block informs; it never gates entries.'
const LESSONS_HEADER = 'Lessons from single trades; hypotheses that may be wrong'

const LABEL_TEXT: Record<BucketLabel, string> = {
  INSUFFICIENT: 'too few trades',
  INCONCLUSIVE: 'inconclusive',
  DIFFERS_POS: 'differs (+)',
  DIFFERS_NEG: 'differs (-)',
}

export interface SetupLearningOptions {
  lessonsPerTrade?: number
  hardRuleFilterEnabled?: boolean
  showExploratoryBuckets?: boolean
}

export interface SetupLearningInput {
  setup: SetupName
  symbol: string
  indicators: TechnicalIndicators
  asOf: string
  trades: TradeEvaluation[]
  options?: SetupLearningOptions
  earnings?: EarningsFlag
}

export interface BucketShown { dimension: string; bucket: string; n: number }
export interface LessonShown { tradeId: string; symbol: string; setup: string }

export interface LearningSnapshot {
  version: 3
  setup: SetupName
  asOf: string
  text: string
  baseline: TradeSummary
  bucketsShown: BucketShown[]
  lessonsShown: LessonShown[]
  excludedLessonCount: number
  filteredLessonCount: number
  hardRuleLessonsFiltered: number
  exploratoryHidden: number
  earnings?: EarningsFlag
}

// Snapshots saved before version 3 stay in the database; readers must accept both.
export type LearningSnapshotV2 = Omit<LearningSnapshot, 'version' | 'hardRuleLessonsFiltered' | 'exploratoryHidden'> & { version: 2 }
export type StoredLearningSnapshot = LearningSnapshotV2 | LearningSnapshot

interface ResolvedOptions { lessonsPerTrade: number; hardRuleFilterEnabled: boolean; showExploratoryBuckets: boolean }

function resolveOptions(options: SetupLearningOptions | undefined): ResolvedOptions {
  return {
    lessonsPerTrade: options?.lessonsPerTrade ?? LESSONS_PER_TRADE,
    hardRuleFilterEnabled: options?.hardRuleFilterEnabled ?? HARD_RULE_FILTER_ENABLED,
    showExploratoryBuckets: options?.showExploratoryBuckets ?? SHOW_EXPLORATORY_BUCKETS,
  }
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

function hasUnnegatedMatch(text: string, pattern: RegExp): boolean {
  for (const match of text.matchAll(new RegExp(pattern.source, 'gi'))) {
    const before = text.slice(Math.max(0, (match.index ?? 0) - NEGATION_LOOKBACK_CHARS), match.index)
    if (IMPERATIVE_MATCH_START.test(match[0]) || !NEGATION_BEFORE_MATCH.test(before)) return true
  }
  return false
}

export function isHardRuleLesson(text: string): boolean {
  return HARD_RULE_LESSON_PATTERNS.some((pattern) => hasUnnegatedMatch(text, pattern))
}

interface CollectedLessons {
  lessons: LessonLine[]
  excludedLessonCount: number
  filteredLessonCount: number
  hardRuleLessonsFiltered: number
}

const NO_LESSONS: CollectedLessons = { lessons: [], excludedLessonCount: 0, filteredLessonCount: 0, hardRuleLessonsFiltered: 0 }

function collectLessons(setupTrades: TradeEvaluation[], options: ResolvedOptions): CollectedLessons {
  const withLessons = setupTrades.filter((t) => t.lessonsLearned.length > 0).sort(bySellDesc)
  const excludedLessonCount = withLessons.filter(isPreFixSectorTrade).length
  const lessons: LessonLine[] = []
  let filteredLessonCount = 0
  let hardRuleLessonsFiltered = 0
  for (const t of withLessons.filter((x) => !isPreFixSectorTrade(x))) {
    const setupName = getStatsSetupName(t)
    let takenFromTrade = 0
    for (const text of t.lessonsLearned) {
      if (!isCleanLesson(text)) {
        filteredLessonCount += 1
        continue
      }
      if (options.hardRuleFilterEnabled && isHardRuleLesson(text)) {
        hardRuleLessonsFiltered += 1
        continue
      }
      if (lessons.length === MAX_LESSONS || takenFromTrade >= options.lessonsPerTrade) continue
      takenFromTrade += 1
      lessons.push({
        line: `- ${text} (${t.symbol} ${setupName} ${fmtDate(t.sellTimestamp)} ${fmtPct(t.pnlPct)})`,
        shown: { tradeId: t.id, symbol: t.symbol, setup: setupName },
      })
    }
  }
  return { lessons, excludedLessonCount, filteredLessonCount, hardRuleLessonsFiltered }
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
  const options = resolveOptions(input.options)
  const records = buildSetupTrackRecords(input.trades)
  const record = records.find((r) => r.setup === input.setup) as SetupTrackRecord
  const setupTrades = input.trades.filter((t) => getStatsSetupName(t) === input.setup)
  const isEmptySetup = setupTrades.length === 0

  const headLines = isEmptySetup ? [`No closed trades for ${input.setup} yet.`] : trackRecordLines(input.setup, record)
  const earningsLine = buildEarningsPromptLine(input.earnings)
  const head = earningsLine ? [...headLines, earningsLine] : headLines
  const producedMatches = isEmptySetup ? [] : matchingConditions(input)
  const allMatches = options.showExploratoryBuckets ? producedMatches : producedMatches.filter((m) => !m.isExploratory)
  const exploratoryHidden = producedMatches.length - allMatches.length
  const symbolLines = sameSymbolLines(input)
  const collected = isEmptySetup ? NO_LESSONS : collectLessons(setupTrades, options)

  let lessonCount = collected.lessons.length
  let matchCount = allMatches.length
  let text = render(head, allMatches.slice(0, matchCount), symbolLines, collected.lessons.slice(0, lessonCount))
  while (!fitsCaps(text) && (lessonCount > 0 || matchCount > 0)) {
    if (lessonCount > 0) lessonCount -= 1
    else matchCount -= 1
    text = render(head, allMatches.slice(0, matchCount), symbolLines, collected.lessons.slice(0, lessonCount))
  }

  const snapshot: LearningSnapshot = {
    version: 3,
    setup: input.setup,
    asOf: input.asOf,
    text,
    baseline: record.baseline,
    bucketsShown: allMatches.slice(0, matchCount).map((m) => m.shown),
    lessonsShown: collected.lessons.slice(0, lessonCount).map((l) => l.shown),
    excludedLessonCount: collected.excludedLessonCount,
    filteredLessonCount: collected.filteredLessonCount,
    hardRuleLessonsFiltered: collected.hardRuleLessonsFiltered,
    exploratoryHidden,
    ...(input.earnings && { earnings: input.earnings }),
  }
  return { text, snapshot }
}

export function buildPatternIds(snapshot: Pick<StoredLearningSnapshot, 'setup' | 'bucketsShown'>): string[] {
  return snapshot.bucketsShown.map((b) => `${snapshot.setup}|${b.dimension}|${b.bucket}`)
}
