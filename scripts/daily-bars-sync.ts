/**
 * Daily Bars Sync — persists historical daily OHLCV bars for every
 * symbol currently held or evaluated by the Buy Scanner in the past
 * week, into daily_bars. Upserts on (symbol, bar_date) — safe to
 * re-run, self-heals gaps from a missed run.
 *
 * Symbol universe: open positions (getOpenPositionContexts()) UNION
 * every distinct symbol in selection_history.candidates_offered from
 * the last 7 days UNION SECTOR_PROXY_ETFS (always synced).
 *
 * A sector-proxy ETF with fewer than BACKFILL_MIN_ROWS rows stored gets
 * up to BACKFILL_TARGET_BARS trading days of history instead of the
 * regular incremental fetch.
 *
 * Dry run (default):
 *   npx tsx --env-file=.env.local scripts/daily-bars-sync.ts
 *
 * Live run (writes to Supabase):
 *   RUN_DAILY_BARS_SYNC=true npx tsx --env-file=.env.local scripts/daily-bars-sync.ts
 */

import { createClient } from '@supabase/supabase-js'
import { getBars } from '../src/lib/alpaca.js'
import { getOpenPositionContexts } from '../src/lib/db.js'
import type { AlpacaBar } from '../src/lib/types.js'

export const SECTOR_PROXY_ETFS = ['SPY', 'GDX', 'XLE', 'XLK', 'COPX', 'URA', 'REMX', 'SMH', 'XLY', 'XLC', 'XME'] as const

export const BACKFILL_MIN_ROWS = 400
export const BACKFILL_TARGET_BARS = 400
// 620 calendar days is about 427 trading days, so the window always holds BACKFILL_TARGET_BARS bars
const BACKFILL_CALENDAR_DAYS = 620
const BACKFILL_PAGE_LIMIT = 1000
const BACKFILL_MAX_PAGES = 20
const BACKFILL_ADJUSTMENT = 'raw'
const INCREMENTAL_DAYS_BACK = 400
const INCREMENTAL_LIMIT = 400
const CANDIDATE_LOOKBACK_DAYS = 7
const MS_PER_DAY = 24 * 60 * 60 * 1000
const DEFAULT_DATA_URL = 'https://data.alpaca.markets'

const db = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface DailyBarRow {
  symbol: string
  bar_date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
  vwap: number
  trade_count: number
}

interface SyncResult {
  rows: DailyBarRow[]
  processed: number
  failed: number
}

export function buildUniverse(symbols: string[]): string[] {
  return [...new Set([...symbols, ...SECTOR_PROXY_ETFS])]
}

export async function getSymbolUniverse(): Promise<string[]> {
  const openPositions = await getOpenPositionContexts()
  const openSymbols = openPositions.map((ctx) => ctx.symbol)

  const lookbackStart = new Date(Date.now() - CANDIDATE_LOOKBACK_DAYS * MS_PER_DAY).toISOString()
  const { data: recentSelections, error } = await db
    .from('selection_history')
    .select('candidates_offered')
    .gte('created_at', lookbackStart)

  if (error) {
    console.error('[DAILY_BARS_ERROR] failed to fetch selection_history:', error.message)
    return buildUniverse(openSymbols)
  }

  const candidateSymbols = (recentSelections ?? []).flatMap((row) => {
    const candidates = row.candidates_offered as Array<{ symbol: string }> | null
    return candidates?.map((c) => c.symbol) ?? []
  })

  return buildUniverse([...openSymbols, ...candidateSymbols])
}

function isSectorProxy(symbol: string): boolean {
  return (SECTOR_PROXY_ETFS as readonly string[]).includes(symbol)
}

async function countStoredRows(symbol: string): Promise<number> {
  const { count, error } = await db
    .from('daily_bars')
    .select('*', { count: 'exact', head: true })
    .eq('symbol', symbol)
  if (error) throw new Error(error.message)
  return count ?? 0
}

function alpacaHeaders(): Record<string, string> {
  const key = process.env.ALPACA_API_KEY
  const secret = process.env.ALPACA_SECRET_KEY
  if (!key || !secret) throw new Error('ALPACA_API_KEY or ALPACA_SECRET_KEY is not set')
  return { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': secret }
}

// getBars() cannot request an adjustment, a start date or a second page, so history uses its own paged request.
export async function fetchHistoryBars(symbol: string, today: Date = new Date()): Promise<AlpacaBar[]> {
  const start = new Date(today.getTime() - BACKFILL_CALENDAR_DAYS * MS_PER_DAY).toISOString().split('T')[0]
  const dataUrl = process.env.ALPACA_DATA_URL ?? DEFAULT_DATA_URL
  const headers = alpacaHeaders()
  const bars: AlpacaBar[] = []
  let pageToken: string | null = null

  for (let page = 0; page < BACKFILL_MAX_PAGES; page++) {
    const url = new URL(`${dataUrl}/v2/stocks/${symbol}/bars`)
    url.searchParams.set('timeframe', '1Day')
    url.searchParams.set('start', start)
    url.searchParams.set('limit', String(BACKFILL_PAGE_LIMIT))
    url.searchParams.set('adjustment', BACKFILL_ADJUSTMENT)
    url.searchParams.set('feed', 'sip')
    url.searchParams.set('sort', 'asc')
    if (pageToken) url.searchParams.set('page_token', pageToken)

    const res = await fetch(url.toString(), { headers })
    if (!res.ok) throw new Error(`Alpaca API error ${res.status}: ${await res.text()}`)
    const body = (await res.json()) as { bars: AlpacaBar[] | null; next_page_token: string | null }
    bars.push(...(body.bars ?? []))
    pageToken = body.next_page_token
    if (!pageToken) return bars.slice(-BACKFILL_TARGET_BARS)
  }
  throw new Error(`${symbol}: history exceeded ${BACKFILL_MAX_PAGES} pages`)
}

async function fetchSymbolBars(symbol: string): Promise<AlpacaBar[]> {
  if (!isSectorProxy(symbol)) return getBars(symbol, '1Day', INCREMENTAL_DAYS_BACK, INCREMENTAL_LIMIT)

  let stored: number | null = null
  try {
    stored = await countStoredRows(symbol)
  } catch (err) {
    console.error(`[DAILY_BARS_ERROR] ${symbol}: stored row count failed:`, err)
  }
  if (stored === null || stored >= BACKFILL_MIN_ROWS) return getBars(symbol, '1Day', INCREMENTAL_DAYS_BACK, INCREMENTAL_LIMIT)

  const bars = await fetchHistoryBars(symbol)
  console.log(`[DAILY_BARS_BACKFILL] ${symbol}: stored=${stored} fetched=${bars.length}`)
  return bars
}

export function toRows(symbol: string, bars: AlpacaBar[]): DailyBarRow[] {
  return bars.map((bar) => ({
    symbol,
    bar_date: bar.t.split('T')[0],
    open: bar.o,
    high: bar.h,
    low: bar.l,
    close: bar.c,
    volume: bar.v,
    vwap: bar.vw,
    trade_count: bar.n,
  }))
}

function dedupeRows(rows: DailyBarRow[]): DailyBarRow[] {
  return [...new Map(rows.map((row) => [`${row.symbol}|${row.bar_date}`, row])).values()]
}

export async function syncSymbols(symbols: string[]): Promise<SyncResult> {
  const rows: DailyBarRow[] = []
  let processed = 0
  let failed = 0

  for (const symbol of symbols) {
    let bars: AlpacaBar[]
    try {
      bars = await fetchSymbolBars(symbol)
    } catch (err) {
      console.error(`[DAILY_BARS_ERROR] ${symbol}: bars fetch failed:`, err)
      failed++
      continue
    }
    rows.push(...toRows(symbol, bars))
    processed++
  }

  return { rows: dedupeRows(rows), processed, failed }
}

async function main() {
  const symbols = await getSymbolUniverse()
  console.log(`[DAILY_BARS] symbol universe: ${symbols.length} symbols`)

  const { rows, processed, failed } = await syncSymbols(symbols)

  if (rows.length === 0) {
    console.log(`[DAILY_BARS_DONE] processed=${processed} failed=${failed} upserted=0`)
    return
  }

  const isLive = process.env.RUN_DAILY_BARS_SYNC === 'true'

  if (!isLive) {
    console.log(`[DAILY_BARS_DONE] processed=${processed} failed=${failed} upserted=0 (dry run, ${rows.length} rows would be upserted)`)
    return
  }

  const { error } = await db.from('daily_bars').upsert(rows, { onConflict: 'symbol,bar_date' })
  if (error) {
    console.error(`[DAILY_BARS_ERROR] batch upsert failed: ${error.message}`)
    console.log(`[DAILY_BARS_DONE] processed=${processed} failed=${failed} upserted=0`)
    return
  }

  console.log(`[DAILY_BARS_DONE] processed=${processed} failed=${failed} upserted=${rows.length}`)
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[DAILY_BARS] Fatal error:', err)
    process.exit(1)
  })
}
