/**
 * Earnings Calendar Sync — copies the Nasdaq earnings calendar for the next
 * LOOKAHEAD_CALENDAR_DAYS days into earnings_calendar. Upserts on
 * (symbol, report_date); safe to re-run.
 *
 * Dry run (default):
 *   npx tsx --env-file=.env.local scripts/earnings-calendar-sync.ts
 *
 * Live run (writes to Supabase):
 *   RUN_EARNINGS_CALENDAR_SYNC=true npx tsx --env-file=.env.local scripts/earnings-calendar-sync.ts
 */

import { upsertEarningsRows, deleteUnrefreshedEarnings, deleteEarningsBefore } from '../src/lib/db.js'
import type { EarningsRow } from '../src/lib/db-earnings.js'
import type { EarningsSession } from '../src/lib/earnings-window.js'

export const LOOKAHEAD_CALENDAR_DAYS = 60
export const PRUNE_AFTER_DAYS = 14
export const MIN_REQUEST_INTERVAL_MS = 250
export const MAX_FAILED_DAY_FRACTION = 0.05
export const EARNINGS_USER_AGENT = 'Mozilla/5.0 (compatible; EVOX-Paquito-EarningsSync/1.0)'

const NASDAQ_URL = 'https://api.nasdaq.com/api/calendar/earnings'
const REQUEST_TIMEOUT_MS = 15000
const UPSERT_CHUNK_SIZE = 1000
const MS_PER_DAY = 24 * 60 * 60 * 1000
const SATURDAY = 6
const SUNDAY = 0

const SESSION_BY_LABEL: Record<string, EarningsSession> = {
  'time-pre-market': 'BMO',
  'time-after-hours': 'AMC',
  'time-not-supplied': 'UNKNOWN',
}

type FetchFn = typeof fetch

interface NasdaqRow {
  symbol?: unknown
  time?: unknown
}

export interface SyncOptions {
  today: string
  lookaheadDays: number
  runStartIso: string
  isLive: boolean
  fetchFn: FetchFn
  sleep: (ms: number) => Promise<void>
}

export interface SyncResult {
  days: string[]
  failedDays: string[]
  rowCount: number
}

function addDays(isoDate: string, days: number): string {
  return new Date(new Date(`${isoDate}T00:00:00Z`).getTime() + days * MS_PER_DAY).toISOString().slice(0, 10)
}

export function buildWeekdays(today: string, lookaheadDays: number): string[] {
  const days: string[] = []
  for (let offset = 0; offset <= lookaheadDays; offset++) {
    const date = addDays(today, offset)
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay()
    if (weekday !== SATURDAY && weekday !== SUNDAY) days.push(date)
  }
  return days
}

export function mapSession(label: string | null | undefined): EarningsSession {
  return (label && SESSION_BY_LABEL[label]) || 'UNKNOWN'
}

export function parseNasdaqRows(body: unknown, reportDate: string, fetchedAt: string): EarningsRow[] {
  const parsed = body as { data?: { rows?: NasdaqRow[] | null } | null; status?: { rCode?: number } } | null
  if (!parsed || typeof parsed !== 'object' || !parsed.data || typeof parsed.data !== 'object') {
    throw new Error('Nasdaq payload has no data object')
  }
  if (parsed.status?.rCode !== undefined && parsed.status.rCode !== 200) {
    throw new Error(`Nasdaq payload status ${parsed.status.rCode}`)
  }

  const bySymbol = new Map<string, EarningsRow>()
  for (const row of parsed.data.rows ?? []) {
    const symbol = typeof row.symbol === 'string' ? row.symbol.trim().toUpperCase() : ''
    if (!symbol || bySymbol.has(symbol)) continue
    bySymbol.set(symbol, {
      symbol,
      report_date: reportDate,
      session: mapSession(typeof row.time === 'string' ? row.time : null),
      fetched_at: fetchedAt,
    })
  }
  return [...bySymbol.values()]
}

export function exceedsFailureThreshold(failedDays: number, totalDays: number): boolean {
  return totalDays > 0 && failedDays / totalDays > MAX_FAILED_DAY_FRACTION
}

async function fetchDay(date: string, fetchFn: FetchFn, runStartIso: string): Promise<EarningsRow[]> {
  const res = await fetchFn(`${NASDAQ_URL}?date=${date}`, {
    headers: { 'User-Agent': EARNINGS_USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`Nasdaq HTTP ${res.status}`)
  return parseNasdaqRows(await res.json(), date, runStartIso)
}

async function fetchDayWithRetry(date: string, options: SyncOptions): Promise<EarningsRow[] | null> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    await options.sleep(MIN_REQUEST_INTERVAL_MS)
    try {
      return await fetchDay(date, options.fetchFn, options.runStartIso)
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      if (attempt === 2) console.error(`[EARNINGS_SYNC_ERROR] ${date}: failed after retry: ${reason}`)
    }
  }
  return null
}

async function persist(rows: EarningsRow[], successDays: string[], options: SyncOptions): Promise<void> {
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK_SIZE) {
    await upsertEarningsRows(rows.slice(i, i + UPSERT_CHUNK_SIZE))
  }
  for (const day of successDays) await deleteUnrefreshedEarnings(day, options.runStartIso)
  await deleteEarningsBefore(addDays(options.today, -PRUNE_AFTER_DAYS))
}

export async function runEarningsSync(options: SyncOptions): Promise<SyncResult> {
  const days = buildWeekdays(options.today, options.lookaheadDays)
  const rows: EarningsRow[] = []
  const successDays: string[] = []
  const failedDays: string[] = []

  for (const day of days) {
    const dayRows = await fetchDayWithRetry(day, options)
    if (dayRows === null) {
      failedDays.push(day)
      continue
    }
    rows.push(...dayRows)
    successDays.push(day)
  }

  if (options.isLive) await persist(rows, successDays, options)
  return { days, failedDays, rowCount: rows.length }
}

async function main() {
  const runStart = new Date()
  const isLive = process.env.RUN_EARNINGS_CALENDAR_SYNC === 'true'
  const result = await runEarningsSync({
    today: runStart.toISOString().slice(0, 10),
    lookaheadDays: LOOKAHEAD_CALENDAR_DAYS,
    runStartIso: runStart.toISOString(),
    isLive,
    fetchFn: fetch,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  })

  const mode = isLive ? '' : ' (dry run, nothing written)'
  console.log(`[EARNINGS_SYNC_DONE] days=${result.days.length} failed=${result.failedDays.length} rows=${result.rowCount}${mode}`)
  if (exceedsFailureThreshold(result.failedDays.length, result.days.length)) {
    console.error(`[EARNINGS_SYNC_ERROR] more than ${MAX_FAILED_DAY_FRACTION * 100}% of days failed: ${result.failedDays.join(', ')}`)
    process.exit(1)
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[EARNINGS_SYNC] Fatal error:', err)
    process.exit(1)
  })
}
