import { randomUUID } from 'crypto'
import { getNextTradingDay } from './alpaca'
import { getEarningsCacheFreshness, getNextEarningsReport } from './db-earnings'
import {
  EARNINGS_PROMPT_WINDOW_TRADING_DAYS,
  evaluateEarningsGate,
  isValidIsoDate,
  toEasternDate,
  type CachedEarnings,
  type EarningsFlag,
} from './earnings-window'
import type { AgentLogEntry, TechnicalIndicators } from './types'

const MS_PER_DAY = 24 * 60 * 60 * 1000
const SATURDAY = 6
const SUNDAY = 0

export interface EarningsCycleContext {
  evaluate(symbol: string): Promise<EarningsFlag>
}

interface CalendarSnapshot {
  entryDate: string
  upcomingTradingDays: string[]
}

interface CacheSnapshot {
  latestFetchedAt: string | null
  failure: unknown
}

function isWeekendDate(isoDate: string): boolean {
  const day = new Date(`${isoDate}T00:00:00Z`).getUTCDay()
  return day === SATURDAY || day === SUNDAY
}

function nextWeekdays(entryDate: string, count: number): string[] {
  const days: string[] = []
  for (let ms = new Date(`${entryDate}T00:00:00Z`).getTime() + MS_PER_DAY; days.length < count; ms += MS_PER_DAY) {
    const date = new Date(ms).toISOString().slice(0, 10)
    if (!isWeekendDate(date)) days.push(date)
  }
  return days
}

async function loadCalendar(now: Date): Promise<CalendarSnapshot> {
  const entryDate = toEasternDate(now.toISOString()) ?? now.toISOString().slice(0, 10)
  try {
    const ahead = Array.from({ length: EARNINGS_PROMPT_WINDOW_TRADING_DAYS }, (_, i) => i + 1)
    const dates = await Promise.all(ahead.map((k) => getNextTradingDay(now, k)))
    const upcoming = dates.map((d) => d.toISOString().slice(0, 10))
    // getNextTradingDay falls back to calendar days on an Alpaca error, which can land on a weekend
    if (upcoming.every(isValidIsoDate) && !upcoming.some(isWeekendDate)) return { entryDate, upcomingTradingDays: upcoming }
    console.warn('[EARNINGS_GATE] trading calendar fell back to calendar days, using weekdays')
  } catch (err) {
    console.warn('[EARNINGS_GATE] trading calendar lookup failed, using weekdays:', err)
  }
  return { entryDate, upcomingTradingDays: nextWeekdays(entryDate, EARNINGS_PROMPT_WINDOW_TRADING_DAYS) }
}

async function loadCache(): Promise<CacheSnapshot> {
  try {
    return { latestFetchedAt: await getEarningsCacheFreshness(), failure: null }
  } catch (err) {
    return { latestFetchedAt: null, failure: err }
  }
}

async function readCachedReport(symbol: string, fromDate: string): Promise<{ cached: CachedEarnings | null; failure: unknown }> {
  try {
    return { cached: await getNextEarningsReport(symbol, fromDate), failure: null }
  } catch (err) {
    return { cached: null, failure: err }
  }
}

export function createEarningsCycleContext(now: Date): EarningsCycleContext {
  let calendar: Promise<CalendarSnapshot> | null = null
  let cache: Promise<CacheSnapshot> | null = null
  let hasWarnedUnusable = false

  return {
    async evaluate(symbol) {
      calendar ??= loadCalendar(now)
      cache ??= loadCache()
      const { entryDate, upcomingTradingDays } = await calendar
      const { latestFetchedAt, failure: freshnessFailure } = await cache
      const { cached, failure: symbolFailure } = await readCachedReport(symbol, entryDate)
      const failure = freshnessFailure ?? symbolFailure

      const flag = evaluateEarningsGate({
        entryDate,
        nextTradingDay: upcomingTradingDays[0],
        upcomingTradingDays,
        cached,
        latestFetchedAt,
        cacheReadFailed: failure !== null,
      })
      if (flag.status !== 'OK' && !hasWarnedUnusable) {
        hasWarnedUnusable = true
        console.warn(`[EARNINGS_GATE] earnings cache is ${flag.status}: entries are not blocked this cycle`, failure ?? '')
      }
      return flag
    },
  }
}

export interface EarningsBlockEntryInput {
  symbol: string
  timestamp: string
  indicators: TechnicalIndicators
  account: { equity: string; cash: string }
  positionCount: number
  reason: string
}

export function buildEarningsBlockEntry(input: EarningsBlockEntryInput): AgentLogEntry {
  return {
    id: randomUUID(),
    timestamp: input.timestamp,
    symbol: input.symbol,
    decision: { action: 'HOLD', symbol: input.symbol, quantity: 0, reasoning: input.reason, confidence: 0 },
    indicators: input.indicators,
    portfolioSnapshot: { equity: input.account.equity, cash: input.account.cash, positionCount: input.positionCount },
    orderExecuted: false,
    error: input.reason,
  }
}
