import {
  insertNearMiss,
  getActiveNearMisses,
  updateNearMiss,
  getActiveNearMissForSymbol,
} from './db'
import type { TechnicalIndicators, ThresholdMap, NearMissEntry } from './types'
import { ZSCORE_ENTRY_THRESHOLD } from './config.js'

// Near-miss zone: z-score between -1.0 and threshold (e.g. -1.293 when threshold is -1.3)
const NEAR_MISS_UPPER = -1.0
// Cancel watchlist entry if z-score reverts above this level
const CANCEL_REVERT_THRESHOLD = -0.5

export async function detectNearMisses(
  symbol: string,
  indicators: TechnicalIndicators,
  thresholdMap: ThresholdMap
): Promise<void> {
  const { kalman, marketRegime } = indicators
  if (!kalman || !marketRegime) return

  const threshold = thresholdMap[symbol] ?? ZSCORE_ENTRY_THRESHOLD
  const zscore = kalman.zScore

  // Near-miss zone: between -1.0 and threshold, only in RANGING regime
  if (zscore > NEAR_MISS_UPPER || zscore <= threshold || marketRegime !== 'RANGING') return

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
  })
}

export async function updateWatchlist(
  thresholdMap: ThresholdMap,
  currentIndicators: Record<string, TechnicalIndicators>
): Promise<void> {
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
    const current = currentIndicators[entry.symbol]
    if (!current?.kalman) continue

    const zscore = current.kalman.zScore
    const regime = current.marketRegime
    const threshold = thresholdMap[entry.symbol] ?? ZSCORE_ENTRY_THRESHOLD

    // Auto-entry conditions: z-score crossed threshold, still RANGING, portfolio has room
    if (zscore <= threshold && regime === 'RANGING' && openPositionsCount < maxPositions) {
      console.log(
        `[WATCHLIST] Auto-entry ready: ${entry.symbol} z=${zscore.toFixed(3)} <= ${threshold.toFixed(3)} ` +
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
