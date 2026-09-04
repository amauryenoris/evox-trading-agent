/**
 * Daily Bars Sync — persists historical daily OHLCV bars for every
 * symbol currently held or evaluated by the Buy Scanner in the past
 * week, into daily_bars. Upserts on (symbol, bar_date) — safe to
 * re-run, self-heals gaps from a missed run.
 *
 * Symbol universe: open positions (getOpenPositionContexts()) UNION
 * every distinct symbol in selection_history.candidates_offered from
 * the last 7 days.
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

const db = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function getSymbolUniverse(): Promise<string[]> {
  const openPositions = await getOpenPositionContexts()
  const openSymbols = openPositions.map((ctx) => ctx.symbol)

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data: recentSelections, error } = await db
    .from('selection_history')
    .select('candidates_offered')
    .gte('created_at', sevenDaysAgo)

  if (error) {
    console.error('[DAILY_BARS_ERROR] failed to fetch selection_history:', error.message)
    return [...new Set(openSymbols)]
  }

  const candidateSymbols = (recentSelections ?? []).flatMap((row) => {
    const candidates = row.candidates_offered as Array<{ symbol: string }> | null
    return candidates?.map((c) => c.symbol) ?? []
  })

  return [...new Set([...openSymbols, ...candidateSymbols])]
}

async function main() {
  const symbols = await getSymbolUniverse()
  console.log(`[DAILY_BARS] symbol universe: ${symbols.length} symbols`)

  const rows: Record<string, unknown>[] = []
  let processed = 0
  let failed = 0

  for (const symbol of symbols) {
    let bars
    try {
      bars = await getBars(symbol, '1Day', 400, 400)
    } catch (err) {
      console.error(`[DAILY_BARS_ERROR] ${symbol}: bars fetch failed:`, err)
      failed++
      continue
    }
    for (const bar of bars) {
      rows.push({
        symbol,
        bar_date: bar.t.split('T')[0],
        open: bar.o,
        high: bar.h,
        low: bar.l,
        close: bar.c,
        volume: bar.v,
        vwap: bar.vw,
        trade_count: bar.n,
      })
    }
    processed++
  }

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

main().catch((err) => {
  console.error('[DAILY_BARS] Fatal error:', err)
  process.exit(1)
})
