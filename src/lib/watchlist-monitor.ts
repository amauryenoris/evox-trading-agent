import {
  insertNearMiss,
  getActiveNearMisses,
  updateNearMiss,
  getActiveNearMissForSymbol,
  cleanupExpiredNearMisses,
  cancelRevertedNearMisses,
  cancelRevertedMRNearMisses,
} from './db'
import type { TechnicalIndicators, ThresholdMap, NearMissEntry } from './types'
import { ZSCORE_ENTRY_THRESHOLD } from './config'

// Near-miss zone: z-score between -1.0 and threshold (e.g. -1.293 when threshold is -1.3)
const NEAR_MISS_UPPER = -1.0
// Cancel watchlist entry if z-score reverts above this level
const CANCEL_REVERT_THRESHOLD = -0.5

export async function detectNearMisses(
  symbol: string,
  indicators: TechnicalIndicators,
  thresholdMap: ThresholdMap,
  blockedByGate?: { wouldExecute: boolean; reason: 'max_positions' | 'max_buys' | 'outranked'; signalType: 'MEAN_REVERSION' | 'TREND_PULLBACK' | 'TREND_ZLE05' | 'EMA_RECLAIM' | null }
): Promise<void> {
  await cleanupExpiredNearMisses()
  console.log('[NEAR-MISS] Cleaned up expired entries')
  await cancelRevertedMRNearMisses(NEAR_MISS_UPPER)
  console.log('[NEAR-MISS] Cancelled reverted MR entries')

  const { kalman, marketRegime } = indicators
  if (!kalman || !marketRegime) return

  const threshold = thresholdMap[symbol] ?? ZSCORE_ENTRY_THRESHOLD
  const zscore = kalman.zScore

  if (blockedByGate?.wouldExecute) {
    // Symbol passed the setup gate and effectiveThreshold but was blocked by portfolio gate
    // Check if there's already an ACTIVE entry for this symbol
    const existing = await getActiveNearMissForSymbol(symbol)
    if (existing) return

    const gap = 0  // already crossed threshold
    console.log(`[WATCHLIST] Blocked-by-gate: ${symbol} z=${zscore.toFixed(3)} threshold=${threshold.toFixed(3)} reason=${blockedByGate.reason}`)

    await insertNearMiss({
      symbol,
      detected_at: new Date().toISOString(),
      initial_zscore: zscore,
      gap_to_threshold: gap,
      initial_regime: marketRegime,
      indicators_snapshot: indicators as unknown as Record<string, unknown>,
      status: 'ACTIVE',
      latest_zscore: zscore,
      latest_regime: marketRegime,
      news_boost_applied: 0,
      effective_threshold: threshold,
      monitoring_cycles: 0,
      expires_at: new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString(),
      signal_type: blockedByGate.signalType,
      near_miss_type: 'BLOCKED_BY_GATE',
      blocked_reason: blockedByGate.reason,
    })
    return
  }

  // Standard near-miss: z-score between -1.0 and threshold, in RANGING or TRANSITION regime
  const nearMissRegimes = ['RANGING', 'TRANSITION']
  if (zscore > NEAR_MISS_UPPER || zscore <= threshold || !nearMissRegimes.includes(marketRegime)) return

  // Check if there's already an ACTIVE entry for this symbol
  const existing = await getActiveNearMissForSymbol(symbol)
  if (existing) return

  const gap = Math.abs(zscore - threshold)
  console.log(`[WATCHLIST] Detected near-miss: ${symbol} z=${zscore.toFixed(3)} (threshold=${threshold.toFixed(3)}, gap=${gap.toFixed(3)})`)

  await insertNearMiss({
    symbol,
    detected_at: new Date().toISOString(),
    initial_zscore: zscore,
    gap_to_threshold: gap,
    initial_regime: marketRegime,
    indicators_snapshot: indicators as unknown as Record<string, unknown>,
    status: 'ACTIVE',
    latest_zscore: zscore,
    latest_regime: marketRegime,
    news_boost_applied: 0,
    effective_threshold: threshold,
    monitoring_cycles: 0,
    expires_at: new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString(),
    signal_type: null,
    near_miss_type: 'NEAR_MISS',
    blocked_reason: null,
  })
}

export async function updateWatchlist(
  thresholdMap: ThresholdMap,
  currentIndicators: Record<string, TechnicalIndicators>
): Promise<void> {
  // Bulk cleanup: runs before the per-symbol loop so entries not in the
  // current watchlist cycle still get expired/cancelled correctly.
  await cleanupExpiredNearMisses()
  console.log('[NEAR-MISS] Cleaned up expired entries')
  await cancelRevertedNearMisses(NEAR_MISS_UPPER)
  console.log('[NEAR-MISS] Cancelled reverted entries (z > NEAR_MISS_UPPER)')

  const activeEntries = await getActiveNearMisses()
  if (activeEntries.length === 0) return

  const now = new Date().toISOString()
  console.log(`[WATCHLIST] Updating ${activeEntries.length} active entries`)

  for (const entry of activeEntries) {
    const current = currentIndicators[entry.symbol]
    if (!current?.kalman) continue

    const zscore = current.kalman.zScore
    const regime = current.marketRegime ?? entry.latest_regime ?? entry.initial_regime
    const threshold = thresholdMap[entry.symbol] ?? ZSCORE_ENTRY_THRESHOLD
    const newsBoost = threshold - ZSCORE_ENTRY_THRESHOLD // deviation from base threshold

    const updates: Partial<Omit<NearMissEntry, 'id' | 'created_at'>> = {
      latest_zscore: zscore,
      latest_regime: regime,
      news_boost_applied: newsBoost,
      effective_threshold: threshold,
      monitoring_cycles: entry.monitoring_cycles + 1,
      gap_to_threshold: zscore - threshold,
    }

    if (zscore > CANCEL_REVERT_THRESHOLD) {
      updates.status = 'CANCELLED'
      updates.cancel_reason = `z-score ${zscore.toFixed(3)} reverted above ${CANCEL_REVERT_THRESHOLD}`
      console.log(`[WATCHLIST] Cancelling ${entry.symbol}: ${updates.cancel_reason}`)
    } else if (entry.expires_at < now) {
      updates.status = 'EXPIRED'
      updates.cancel_reason = '5-day monitoring window expired'
      console.log(`[WATCHLIST] Expiring ${entry.symbol}: monitoring window ended`)
    }

    await updateNearMiss(entry.id, updates)
  }
}

export async function checkAutoEntry(
  thresholdMap: ThresholdMap,
  currentIndicators: Record<string, TechnicalIndicators>,
  openPositionsCount: number,
  maxPositions = 5
): Promise<string[]> {
  const activeEntries = await getActiveNearMisses()
  if (activeEntries.length === 0) return []

  const readyForEntry: string[] = []

  for (const entry of activeEntries) {
    const currentZScore = currentIndicators[entry.symbol]?.kalman?.zScore

    if (currentZScore == null) {
      console.log(`[AUTO-ENTRY] ${entry.symbol}: skipped — no current indicators available`)
      continue
    }

    const regime = currentIndicators[entry.symbol]?.marketRegime
    const threshold = thresholdMap[entry.symbol] ?? ZSCORE_ENTRY_THRESHOLD

    // Regime check depends on signal type:
    // MEAN_REVERSION requires RANGING; TREND_PULLBACK and EMA_RECLAIM work in any regime
    const signalType = entry.signal_type
    const regimeOk = signalType === 'MEAN_REVERSION'
      ? regime === 'RANGING'
      : true  // TREND_PULLBACK and EMA_RECLAIM work in any regime

    // mrRangingAdxFloor must stay in sync with claude-agent.ts's mrRangingAdxFloor (= 18)
    const adxValue = currentIndicators[entry.symbol]?.adx ?? null
    const mrRangingAdxBlocked =
      entry.signal_type === 'MEAN_REVERSION' &&
      regime === 'RANGING' &&
      typeof adxValue === 'number' &&
      Number.isFinite(adxValue) &&
      adxValue < 18

    const nullSignalTypeBlocked = entry.signal_type === null

    if (mrRangingAdxBlocked) {
      console.log(`[AUTO-ENTRY] ${entry.symbol}: skipped — MR_RANGING_ADX_GATE (ADX=${adxValue} < 18, regime=RANGING)`)
      continue
    }

    if (nullSignalTypeBlocked) {
      console.log(`[AUTO-ENTRY] ${entry.symbol}: skipped — signal_type is null, no named setup`)
      continue
    }

    // Auto-entry conditions: z-score crossed threshold, regime ok, portfolio has room
    if (currentZScore <= threshold && regimeOk && openPositionsCount < maxPositions) {
      console.log(
        `[WATCHLIST] Auto-entry ready: ${entry.symbol} z=${currentZScore.toFixed(3)} <= ${threshold.toFixed(3)} ` +
        `(monitored ${entry.monitoring_cycles} cycles${entry.news_boost_applied !== 0 ? `, boost=${entry.news_boost_applied.toFixed(3)}` : ''})`
      )
      // Mark as TRIGGERED
      await updateNearMiss(entry.id, { status: 'TRIGGERED' })
      readyForEntry.push(entry.symbol)
    }
  }

  return readyForEntry
}

export async function markWatchlistTriggered(
  symbol: string,
  agentLogId: string
): Promise<void> {
  const db_entry = await getActiveNearMissForSymbol(symbol)
  if (!db_entry) return
  await updateNearMiss(db_entry.id, {
    status: 'TRIGGERED',
    triggered_agent_log_id: agentLogId,
  })
}
