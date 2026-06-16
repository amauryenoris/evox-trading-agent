/**
 * Backfill script: populates spx_price, spx_sma50, spx_sma200, spx_regime
 * for trade_evaluations rows with buy_timestamp >= 2026-04-20.
 *
 * Methodology:
 * - SPY snapshot = previous trading day's close relative to buy_timestamp
 * - buy_timestamp converted to ET date to avoid UTC midnight edge cases
 * - SMA50/SMA200 computed using only data available before entry date
 * - No lookahead bias — at entry time only previous close was known
 * - Regime: spyClose > sma200 → BULL | spyClose > sma50 → CAUTION | else → BEAR
 *
 * Dry run (default):
 *   npx tsx --env-file=.env.local scripts/backfill-spx-regime.ts
 *
 * Live run (writes to Supabase):
 *   RUN_BACKFILL=true npx tsx --env-file=.env.local scripts/backfill-spx-regime.ts
 */

import { createClient } from '@supabase/supabase-js'

const DATA_URL = process.env.ALPACA_DATA_URL ?? 'https://data.alpaca.markets'

const ALPACA_HEADERS = {
  'APCA-API-KEY-ID': process.env.ALPACA_API_KEY!,
  'APCA-API-SECRET-KEY': process.env.ALPACA_SECRET_KEY!,
}

const db = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function toEtDate(isoTimestamp: string): string {
  return new Date(isoTimestamp).toLocaleDateString('en-CA', {
    timeZone: 'America/New_York',
  })
}

function smaAtIndex(closes: number[], index: number, period: number): number | null {
  if (index < period - 1) return null
  const slice = closes.slice(index - period + 1, index + 1)
  return slice.reduce((a, b) => a + b, 0) / period
}

async function main() {
  // STEP 1 — Fetch trades to backfill
  const { data: trades, error: fetchError } = await db
    .from('trade_evaluations')
    .select('id, symbol, buy_timestamp')
    .is('spx_price', null)
    .gte('buy_timestamp', '2026-04-20')
    .order('buy_timestamp', { ascending: true })

  if (fetchError) {
    console.log(`[BACKFILL_ERROR] Failed to fetch trades: ${fetchError.message}`)
    process.exit(1)
  }

  if (!trades || trades.length === 0) {
    console.log('[BACKFILL_DRY_DONE] wouldUpdate=0 wouldSkip=0')
    return
  }

  // STEP 2 — Single bulk fetch of SPY daily bars from Alpaca
  const earliest = new Date(trades[0].buy_timestamp)
  const latest = new Date(trades[trades.length - 1].buy_timestamp)

  earliest.setDate(earliest.getDate() - 400)
  latest.setDate(latest.getDate() + 5)

  const earliestDate = earliest.toISOString().split('T')[0]
  const latestDate = latest.toISOString().split('T')[0]

  const url = new URL(`${DATA_URL}/v2/stocks/SPY/bars`)
  url.searchParams.set('timeframe', '1Day')
  url.searchParams.set('start', earliestDate)
  url.searchParams.set('end', latestDate)
  url.searchParams.set('limit', '1000')
  url.searchParams.set('sort', 'asc')
  url.searchParams.set('feed', 'iex')

  let bars: Array<{ date: string; close: number }>
  try {
    const res = await fetch(url.toString(), { headers: ALPACA_HEADERS })
    if (!res.ok) {
      const body = await res.text()
      console.log(`[BACKFILL_ERROR] Alpaca fetch failed ${res.status}: ${body}`)
      process.exit(1)
    }
    const data = await res.json() as { bars: Array<{ t: string; c: number }> }
    bars = (data.bars ?? []).map(b => ({ date: b.t.split('T')[0], close: b.c }))
  } catch (err) {
    console.log(`[BACKFILL_ERROR] Alpaca fetch error: ${(err as Error).message}`)
    process.exit(1)
  }

  const closes = bars.map(b => b.close)
  const isLive = process.env.RUN_BACKFILL === 'true'
  let updated = 0
  let skipped = 0
  let failed = 0

  for (const trade of trades) {
    // STEP 3 — Find previous trading day's close
    const tradeDate = toEtDate(trade.buy_timestamp)
    let i = -1
    for (let j = bars.length - 1; j >= 0; j--) {
      if (bars[j].date < tradeDate) {
        i = j
        break
      }
    }

    if (i === -1) {
      console.log(`[BACKFILL_SKIP] id=${trade.id} symbol=${trade.symbol} reason=no_prior_bar`)
      skipped++
      continue
    }

    // STEP 4 — Compute SMA50 and SMA200
    const spyClose = bars[i].close
    const sma50 = smaAtIndex(closes, i, 50)
    const sma200 = smaAtIndex(closes, i, 200)

    if (sma50 === null || sma200 === null) {
      console.log(`[BACKFILL_SKIP] id=${trade.id} symbol=${trade.symbol} reason=insufficient_bars`)
      skipped++
      continue
    }

    // STEP 5 — Classify regime
    const regime = spyClose > sma200 ? 'BULL' : spyClose > sma50 ? 'CAUTION' : 'BEAR'
    const buyDate = toEtDate(trade.buy_timestamp)
    const logLine = `id=${trade.id} symbol=${trade.symbol} buy=${buyDate} spy=${spyClose.toFixed(2)} sma50=${sma50.toFixed(2)} sma200=${sma200.toFixed(2)} regime=${regime}`

    if (!isLive) {
      // STEP 6 — DRY RUN
      console.log(`[BACKFILL_DRY] ${logLine}`)
      updated++
    } else {
      // STEP 7 — LIVE MODE
      const { error: updateError } = await db
        .from('trade_evaluations')
        .update({
          spx_price: spyClose,
          spx_sma50: sma50,
          spx_sma200: sma200,
          spx_regime: regime,
        })
        .eq('id', trade.id)
        .is('spx_price', null)

      if (updateError) {
        console.log(`[BACKFILL_ROW_ERROR] id=${trade.id} ${updateError.message}`)
        failed++
      } else {
        console.log(`[BACKFILL] ${logLine}`)
        updated++
      }
    }
  }

  if (!isLive) {
    console.log(`[BACKFILL_DRY_DONE] wouldUpdate=${updated} wouldSkip=${skipped}`)
  } else {
    console.log(`[BACKFILL_DONE] updated=${updated} skipped=${skipped} failed=${failed}`)
  }
}

main()
