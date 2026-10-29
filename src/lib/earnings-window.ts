export const EARNINGS_BLOCK = 'EARNINGS_BLOCK'
export const EARNINGS_BLOCK_TRADING_DAYS = 1
export const EARNINGS_STALE_TRADING_DAYS = 2
export const EARNINGS_PROMPT_WINDOW_TRADING_DAYS = 5

const MS_PER_DAY = 24 * 60 * 60 * 1000
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const EASTERN_TIME_ZONE = 'America/New_York'
const SUNDAY = 0
const SATURDAY = 6

export type EarningsSession = 'BMO' | 'AMC' | 'UNKNOWN'
export type EarningsStatus = 'OK' | 'UNKNOWN' | 'STALE'
export type EarningsBlockReason = 'IN_WINDOW' | 'OUTSIDE_WINDOW' | 'DISABLED' | 'UNKNOWN'

export interface EarningsFlag {
  nextReportDate: string | null
  session: EarningsSession | null
  tradingDaysAway: number | null
  blocked: boolean
  source: 'nasdaq'
  status: EarningsStatus
}

export interface CachedEarnings {
  reportDate: string
  session: EarningsSession
}

export interface EarningsGateInput {
  entryDate: string
  nextTradingDay: string | null | undefined
  upcomingTradingDays: readonly string[]
  cached: CachedEarnings | null
  latestFetchedAt: string | null
  cacheReadFailed: boolean
  blockDays?: number
}

const SESSION_LABEL: Record<EarningsSession, string> = {
  BMO: 'before open',
  AMC: 'after close',
  UNKNOWN: 'time not supplied',
}

export function earningsSessionLabel(session: EarningsSession): string {
  return SESSION_LABEL[session]
}

function toUtcMs(isoDate: string): number {
  return new Date(`${isoDate}T00:00:00Z`).getTime()
}

export function isValidIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE_PATTERN.test(value)) return false
  const ms = toUtcMs(value)
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value
}

function isWeekend(isoDate: string): boolean {
  const day = new Date(toUtcMs(isoDate)).getUTCDay()
  return day === SATURDAY || day === SUNDAY
}

export function isEarningsBlocked(
  entryDate: string,
  reportDate: string | null | undefined,
  nextTradingDay: string | null | undefined,
  blockDays: number = EARNINGS_BLOCK_TRADING_DAYS
): { blocked: boolean; reason: EarningsBlockReason } {
  if (!isValidIsoDate(entryDate) || !isValidIsoDate(reportDate) || !isValidIsoDate(nextTradingDay) || isWeekend(nextTradingDay)) {
    return { blocked: false, reason: 'UNKNOWN' }
  }
  if (blockDays < 1) return { blocked: false, reason: 'DISABLED' }
  const isInWindow = reportDate === entryDate || reportDate === nextTradingDay
  return isInWindow ? { blocked: true, reason: 'IN_WINDOW' } : { blocked: false, reason: 'OUTSIDE_WINDOW' }
}

export function buildEarningsBlockReason(symbol: string, reportDate: string, session: EarningsSession): string {
  return `${EARNINGS_BLOCK}: ${symbol} reports ${reportDate} (${SESSION_LABEL[session]})`
}

export function countTradingDaysAway(
  entryDate: string,
  reportDate: string,
  upcomingTradingDays: readonly string[]
): number | null {
  if (!isValidIsoDate(entryDate) || !isValidIsoDate(reportDate)) return null
  if (reportDate === entryDate) return 0
  const index = upcomingTradingDays.indexOf(reportDate)
  return index === -1 ? null : index + 1
}

export function toEasternDate(isoTimestamp: string): string | null {
  const ms = new Date(isoTimestamp).getTime()
  if (!Number.isFinite(ms)) return null
  return new Intl.DateTimeFormat('en-CA', { timeZone: EASTERN_TIME_ZONE }).format(new Date(ms))
}

function countWeekdaysAfter(fromDate: string, toDate: string): number {
  let count = 0
  for (let ms = toUtcMs(fromDate) + MS_PER_DAY; ms <= toUtcMs(toDate); ms += MS_PER_DAY) {
    const day = new Date(ms).getUTCDay()
    if (day !== SATURDAY && day !== SUNDAY) count++
  }
  return count
}

function emptyFlag(status: EarningsStatus): EarningsFlag {
  return { nextReportDate: null, session: null, tradingDaysAway: null, blocked: false, source: 'nasdaq', status }
}

function isCacheStale(latestFetchedAt: string, entryDate: string): boolean {
  const fetchedDate = toEasternDate(latestFetchedAt)
  if (fetchedDate === null) return false
  return countWeekdaysAfter(fetchedDate, entryDate) > EARNINGS_STALE_TRADING_DAYS
}

export function evaluateEarningsGate(input: EarningsGateInput): EarningsFlag {
  if (input.cacheReadFailed || input.latestFetchedAt === null || !isValidIsoDate(input.entryDate)) return emptyFlag('UNKNOWN')
  if (toEasternDate(input.latestFetchedAt) === null) return emptyFlag('UNKNOWN')
  if (isCacheStale(input.latestFetchedAt, input.entryDate)) return emptyFlag('STALE')
  if (input.cached === null) return { ...emptyFlag('OK') }
  if (!isValidIsoDate(input.cached.reportDate)) return emptyFlag('UNKNOWN')

  const { blocked } = isEarningsBlocked(input.entryDate, input.cached.reportDate, input.nextTradingDay, input.blockDays)
  return {
    nextReportDate: input.cached.reportDate,
    session: input.cached.session,
    tradingDaysAway: countTradingDaysAway(input.entryDate, input.cached.reportDate, input.upcomingTradingDays),
    blocked,
    source: 'nasdaq',
    status: 'OK',
  }
}

export function buildEarningsPromptLine(flag: EarningsFlag | undefined): string | null {
  if (!flag || flag.status !== 'OK' || !flag.nextReportDate || !flag.session || flag.tradingDaysAway === null) return null
  if (flag.tradingDaysAway > EARNINGS_PROMPT_WINDOW_TRADING_DAYS) return null
  return `Earnings: reports ${flag.nextReportDate} (${SESSION_LABEL[flag.session]}), ${flag.tradingDaysAway} trading days away`
}

export function isEarningsBlockError(error: string | null | undefined): boolean {
  return typeof error === 'string' && error.startsWith(EARNINGS_BLOCK)
}
