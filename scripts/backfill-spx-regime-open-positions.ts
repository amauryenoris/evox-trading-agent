/**
 * Backfill script: fills missing spx_price/spx_sma50/spx_sma200/spx_regime
 * keys inside the `indicators` jsonb column of open_position_contexts, for
 * currently-open positions only.
 *
 * Unlike scripts/backfill-spx-regime.ts (which gates each trade_evaluations
 * row all-or-nothing on spx_price IS NULL), this script merges per-field:
 * a row that already has a correct spx_price (e.g. CVX) keeps it untouched,
 * and only the still-null fields get computed and written.
 *
 * Methodology (identical to scripts/backfill-spx-regime.ts, not modified —
 * see scripts/lib/spx-snapshot-helpers.ts for the shared pure-function copy):
 * - SPY snapshot = previous trading day's close relative to buy_timestamp
 * - buy_timestamp converted to ET date to avoid UTC midnight edge cases
 * - SMA50/SMA200 computed using only data available before entry date
 * - No lookahead bias — at entry time only previous close was known
 * - Regime: spyClose > sma200 → BULL | spyClose > sma50 → CAUTION | else → BEAR
 *
 * Dry run (default):
 *   npx tsx --env-file=.env.local scripts/backfill-spx-regime-open-positions.ts
 *
 * Live run (writes to Supabase):
 *   RUN_BACKFILL=true npx tsx --env-file=.env.local scripts/backfill-spx-regime-open-positions.ts
 */

import { createClient } from '@supabase/supabase-js'
import {
  toEtDate,
  smaAtIndex,
  findPriorBarIndex,
  classifyRegime,
  type SpyBar,
} from './lib/spx-snapshot-helpers'

const DATA_URL = process.env.ALPACA_DATA_URL ?? 'https://data.alpaca.markets'

const ALPACA_HEADERS = {
  'APCA-API-KEY-ID': process.env.ALPACA_API_KEY!,
  'APCA-API-SECRET-KEY': process.env.ALPACA_SECRET_KEY!,
}

const db = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface OpenPositionRow {
  symbol: string
  buy_timestamp: string
  indicators: Record<string, unknown>
}

function hasMissingSpxField(indicators: Record<string, unknown>): boolean {
  return (
    indicators.spx_price === null || indicators.spx_price === undefined ||
    indicators.spx_sma50 === null || indicators.spx_sma50 === undefined ||
    indicators.spx_sma200 === null || indicators.spx_sma200 === undefined ||
    indicators.spx_regime === null || indicators.spx_regime === undefined
  )
}

async function fetchSpyBars(earliestBuyTimestamp: string, latestBuyTimestamp: string): Promise<SpyBar[]> {
  const earliest = new Date(earliestBuyTimestamp)
  const latest = new Date(latestBuyTimestamp)

  earliest.setDate(earliest.getDate() - 400)
  latest.setDate(latest.getDate() + 5)

  const url = new URL(`${DATA_URL}/v2/stocks/SPY/bars`)
  url.searchParams.set('timeframe', '1Day')
  url.searchParams.set('start', earliest.toISOString().split('T')[0])
  url.searchParams.set('end', latest.toISOString().split('T')[0])
  url.searchParams.set('limit', '1000')
  url.searchParams.set('sort', 'asc')
  url.searchParams.set('feed', 'iex')

  const res = await fetch(url.toString(), { headers: ALPACA_HEADERS })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Alpaca fetch failed ${res.status}: ${body}`)
  }
  const data = await res.json() as { bars: Array<{ t: string; c: number }> }
  return (data.bars ?? []).map(b => ({ date: b.t.split('T')[0], close: b.c }))
}

async function main() {
  // STEP 1 — Fetch all open positions (table is small — bounded by MAX_POSITIONS)
  const { data: rows, error: fetchError } = await db
    .from('open_position_contexts')
    .select('symbol, buy_timestamp, indicators')

  if (fetchError) {
    console.log(`[BACKFILL_OPC_ERROR] Failed to fetch open positions: ${fetchError.message}`)
    process.exit(1)
  }

  const isLive = process.env.RUN_BACKFILL === 'true'
  const candidates = ((rows ?? []) as OpenPositionRow[])
    .filter(row => hasMissingSpxField(row.indicators ?? {}))
    .sort((a, b) => a.buy_timestamp.localeCompare(b.buy_timestamp))

  if (candidates.length === 0) {
    if (isLive) {
      console.log('[BACKFILL_OPC_DONE] updated=0 skipped=0 failed=0')
    } else {
      console.log('[BACKFILL_OPC_DRY_DONE] wouldUpdate=0 wouldSkip=0')
    }
    return
  }

  // STEP 2 — Single bulk fetch of SPY daily bars from Alpaca, spanning only the candidates
  let bars: SpyBar[]
  try {
    bars = await fetchSpyBars(
      candidates[0].buy_timestamp,
      candidates[candidates.length - 1].buy_timestamp
    )
  } catch (err) {
    console.log(`[BACKFILL_OPC_ERROR] ${(err as Error).message}`)
    process.exit(1)
  }

  const closes = bars.map(b => b.close)
  let updated = 0
  let skipped = 0
  let failed = 0

  for (const row of candidates) {
    const indicators = row.indicators ?? {}
    const needsPrice = indicators.spx_price === null || indicators.spx_price === undefined
    const needsSmaOrRegime =
      indicators.spx_sma50 === null || indicators.spx_sma50 === undefined ||
      indicators.spx_sma200 === null || indicators.spx_sma200 === undefined ||
      indicators.spx_regime === null || indicators.spx_regime === undefined

    // STEP 3 — Find previous trading day's close, anchored to this row's own buy_timestamp
    const buyDate = toEtDate(row.buy_timestamp)
    const i = findPriorBarIndex(bars, buyDate)

    if (i === -1) {
      console.log(`[BACKFILL_OPC_SKIP] symbol=${row.symbol} reason=no_prior_bar`)
      skipped++
      continue
    }

    const spyClose = bars[i].close
    const sma50 = smaAtIndex(closes, i, 50)
    const sma200 = smaAtIndex(closes, i, 200)

    // STEP 4 — Build the per-field merge: only the currently-null fields are written
    const fields: Record<string, number | string> = {}
    if (needsPrice) fields.spx_price = spyClose
    if (needsSmaOrRegime && sma50 !== null && sma200 !== null) {
      fields.spx_sma50 = sma50
      fields.spx_sma200 = sma200
      fields.spx_regime = classifyRegime(spyClose, sma50, sma200)
    }

    if (Object.keys(fields).length === 0) {
      console.log(`[BACKFILL_OPC_SKIP] symbol=${row.symbol} reason=insufficient_bars`)
      skipped++
      continue
    }
    if (needsSmaOrRegime && (sma50 === null || sma200 === null)) {
      console.log(`[BACKFILL_OPC_SKIP] symbol=${row.symbol} reason=insufficient_bars (spx_price still written)`)
    }

    const logLine =
      `symbol=${row.symbol} buy=${buyDate} spy=${spyClose.toFixed(2)}` +
      ` sma50=${sma50?.toFixed(2) ?? 'n/a'} sma200=${sma200?.toFixed(2) ?? 'n/a'}` +
      ` regime=${fields.spx_regime ?? 'n/a'} fields_updated=[${Object.keys(fields).join(',')}]`

    if (!isLive) {
      // STEP 5 — DRY RUN
      console.log(`[BACKFILL_OPC_DRY] ${logLine}`)
      updated++
    } else {
      // STEP 6 — LIVE MODE — merge into existing indicators, never replace wholesale
      const mergedIndicators = { ...indicators, ...fields }
      const { error: updateError } = await db
        .from('open_position_contexts')
        .update({ indicators: mergedIndicators })
        .eq('symbol', row.symbol)

      if (updateError) {
        console.log(`[BACKFILL_OPC_ROW_ERROR] symbol=${row.symbol} ${updateError.message}`)
        failed++
      } else {
        console.log(`[BACKFILL_OPC] ${logLine}`)
        updated++
      }
    }
  }

  if (!isLive) {
    console.log(`[BACKFILL_OPC_DRY_DONE] wouldUpdate=${updated} wouldSkip=${skipped}`)
  } else {
    console.log(`[BACKFILL_OPC_DONE] updated=${updated} skipped=${skipped} failed=${failed}`)
  }
}

main()
