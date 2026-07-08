/**
 * Position Health Monitor — daily re-evaluation of currently-open positions.
 *
 * For every open position, recomputes its current technical state from fresh
 * bars (ADX/MACD/z-score buckets, SPX regime) and compares it against the
 * entry-time state already stored in open_position_contexts.indicators.
 * state_fingerprint. Inserts one row per position into
 * position_health_snapshots as a single atomic batch, all sharing the same
 * snapshot_timestamp.
 *
 * Observability only — no score, no gate, no alert, no exit action. Zero
 * writes to open_position_contexts, trade_evaluations, or agent_log.
 *
 * Dry run (default):
 *   npx tsx --env-file=.env.local scripts/position-health-check.ts
 *
 * Live run (writes to Supabase):
 *   RUN_HEALTH_CHECK=true npx tsx --env-file=.env.local scripts/position-health-check.ts
 */

import { createClient } from '@supabase/supabase-js'
import { getBars } from '../src/lib/alpaca.js'
import { calculateAllIndicators } from '../src/lib/indicators.js'
import { getAdxBucket, getMacdBucket, getZBucket, computeSpxSnapshot } from '../src/lib/state-fingerprint.js'
import { getOpenPositionContexts } from '../src/lib/db.js'
import type { OpenPositionContext } from '../src/lib/types.js'

const db = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type ZBucketSignalType = 'MEAN_REVERSION' | 'TREND_PULLBACK' | 'TREND_ZLE05' | 'EMA_RECLAIM' | null

function toZBucketSignalType(signalType: OpenPositionContext['signalType']): ZBucketSignalType {
  return signalType === 'MEAN_REVERSION' ||
    signalType === 'TREND_PULLBACK' ||
    signalType === 'TREND_ZLE05' ||
    signalType === 'EMA_RECLAIM'
    ? signalType
    : null
}

function getTradingDaysSinceEntry(buyTimestamp: string): number {
  const msPerDay = 1000 * 60 * 60 * 24
  const elapsed = Date.now() - new Date(buyTimestamp).getTime()
  const calendarDays = elapsed / msPerDay
  return Math.floor(calendarDays * (5 / 7))
}

interface EntryFingerprint {
  adx_bucket: string | null
  macd_bucket: string | null
  z_bucket: string | null
  spx_regime: string | null
}

function readEntryFingerprint(indicators: OpenPositionContext['indicators'], symbol: string): EntryFingerprint {
  const rawIndicators = indicators as unknown as Record<string, unknown>
  const fingerprint = rawIndicators?.state_fingerprint as Record<string, unknown> | undefined

  if (!fingerprint) {
    console.log(`[HEALTH_CHECK] ${symbol}: no state_fingerprint on this position (predates SF-B)`)
    return { adx_bucket: null, macd_bucket: null, z_bucket: null, spx_regime: null }
  }

  return {
    adx_bucket: typeof fingerprint.adx_bucket === 'string' ? fingerprint.adx_bucket : null,
    macd_bucket: typeof fingerprint.macd_bucket === 'string' ? fingerprint.macd_bucket : null,
    z_bucket: typeof fingerprint.z_bucket === 'string' ? fingerprint.z_bucket : null,
    spx_regime: typeof fingerprint.spx_regime === 'string' ? fingerprint.spx_regime : null,
  }
}

async function main() {
  const snapshotTimestamp = new Date().toISOString()

  const openPositions = await getOpenPositionContexts()

  const spyBars = await getBars('SPY', '1Day', 400).catch((err: unknown) => {
    console.error('[HEALTH_CHECK_ERROR] SPY: failed bars fetch:', err)
    return []
  })
  if (spyBars.length < 200) {
    console.error(`[HEALTH_CHECK_ERROR] SPY: insufficient bars fetch (${spyBars.length})`)
  }
  const spxSnapshot = spyBars.length >= 200
    ? computeSpxSnapshot(spyBars)
    : { spx_price: null, spx_sma50: null, spx_sma200: null, spx_regime: null }

  const rows: Record<string, unknown>[] = []
  let processed = 0
  let failed = 0

  for (const ctx of openPositions) {
    let bars
    try {
      bars = await getBars(ctx.symbol, '1Day', 400)
    } catch (err) {
      console.error(`[HEALTH_CHECK_ERROR] ${ctx.symbol}: bars fetch failed:`, err)
      failed++
      continue
    }

    if (bars.length < 200) {
      console.error(`[HEALTH_CHECK_ERROR] ${ctx.symbol}: insufficient history (${bars.length} bars)`)
      failed++
      continue
    }

    const currentIndicators = calculateAllIndicators(bars)
    const zBucketSignalType = toZBucketSignalType(ctx.signalType)

    const currentAdxBucket = getAdxBucket(currentIndicators.adx)
    const currentMacdBucket = getMacdBucket(currentIndicators.macd?.histogram ?? null)
    const currentZBucket = getZBucket(currentIndicators.kalman?.zScore ?? null, zBucketSignalType)
    const currentSpxRegime = spxSnapshot.spx_regime

    const entryFingerprint = readEntryFingerprint(ctx.indicators, ctx.symbol)
    const daysSinceEntry = getTradingDaysSinceEntry(ctx.buyTimestamp)

    rows.push({
      symbol: ctx.symbol,
      position_buy_timestamp: ctx.buyTimestamp,
      snapshot_timestamp: snapshotTimestamp,
      entry_adx_bucket: entryFingerprint.adx_bucket,
      entry_macd_bucket: entryFingerprint.macd_bucket,
      entry_z_bucket: entryFingerprint.z_bucket,
      entry_spx_regime: entryFingerprint.spx_regime,
      current_adx_bucket: currentAdxBucket,
      current_macd_bucket: currentMacdBucket,
      current_z_bucket: currentZBucket,
      current_spx_regime: currentSpxRegime,
      current_adx: currentIndicators.adx,
      current_macd_histogram: currentIndicators.macd?.histogram ?? null,
      current_z_score: currentIndicators.kalman?.zScore ?? null,
      current_price: currentIndicators.currentPrice,
      days_since_entry: daysSinceEntry,
    })
    processed++

    console.log(
      `[HEALTH_CHECK] ${ctx.symbol}:` +
      ` entry=(adx=${entryFingerprint.adx_bucket} macd=${entryFingerprint.macd_bucket}` +
      ` z=${entryFingerprint.z_bucket} spx=${entryFingerprint.spx_regime})` +
      ` current=(adx=${currentAdxBucket} macd=${currentMacdBucket}` +
      ` z=${currentZBucket} spx=${currentSpxRegime})`
    )
  }

  if (rows.length === 0) {
    console.log(`[HEALTH_CHECK_DONE] processed=0 inserted=0 failed=${failed}`)
    return
  }

  const isLive = process.env.RUN_HEALTH_CHECK === 'true'

  if (!isLive) {
    console.log(JSON.stringify(rows, null, 2))
    console.log(`[HEALTH_CHECK_DONE] processed=${processed} failed=${failed} inserted=0`)
    return
  }

  const { error } = await db.from('position_health_snapshots').insert(rows)
  if (error) {
    console.error(`[HEALTH_CHECK_ERROR] batch insert failed: ${error.message}`)
    console.log(`[HEALTH_CHECK_DONE] processed=${processed} failed=${failed} inserted=0`)
    return
  }

  console.log(`[HEALTH_CHECK_DONE] processed=${processed} failed=${failed} inserted=${rows.length}`)
}

main().catch((err) => {
  console.error('[HEALTH_CHECK] Fatal error:', err)
  process.exit(1)
})
