import { ZSCORE_ENTRY_THRESHOLD } from './config'
import type { AlpacaPosition, TechnicalIndicators } from './types'

// ============================================================
// SIGNAL TYPE DETECTOR — mean reversion vs trend following
// ============================================================

export interface SignalResult {
  type: 'MEAN_REVERSION' | 'TREND_FOLLOWING' | 'NO_SIGNAL'
  confidence: number
}

export function generateSignalType(indicators: TechnicalIndicators): SignalResult {
  const { kalman, adx, macd, sma50, rsi, currentPrice, marketRegime, bollingerBands } = indicators

  // Mean Reversion: price significantly below fair value in a ranging market
  if (
    marketRegime === 'RANGING' &&
    kalman && kalman.zScore < ZSCORE_ENTRY_THRESHOLD &&
    (rsi ?? 50) < 45 &&
    bollingerBands && bollingerBands.percentB < 0.2
  ) {
    return {
      type: 'MEAN_REVERSION',
      confidence: Math.min(Math.abs(kalman.zScore) / 3, 1.0),
    }
  }

  // Trend Following: strong directional momentum confirmed across indicators
  if (
    marketRegime === 'TRENDING' &&
    (adx ?? 0) > 25 &&
    macd !== null && macd.histogram > 0 && macd.macdLine > macd.signalLine &&
    currentPrice > (sma50 ?? 0) &&
    (rsi ?? 0) > 50 && (rsi ?? 0) < 75
  ) {
    return {
      type: 'TREND_FOLLOWING',
      confidence: Math.min((adx ?? 25) / 50, 1.0),
    }
  }

  return { type: 'NO_SIGNAL', confidence: 0 }
}

// ============================================================
// POSITION ROTATION — swap weakest position for better setup
// ============================================================

export interface RotationDecision {
  rotate: boolean
  exitSymbol?: string
  reason: string
}

export async function evaluateRotation(
  newSignal: SignalResult,
  openPositions: AlpacaPosition[],
  indicatorsCache: Map<string, TechnicalIndicators>,
): Promise<RotationDecision> {
  // Only evaluate if signal is strong enough
  if (newSignal.confidence < 0.70) {
    return { rotate: false, reason: 'Signal too weak for rotation' }
  }

  const exitCandidates: { symbol: string; reason: string; priority: number }[] = []

  for (const pos of openPositions) {
    const ind = indicatorsCache.get(pos.symbol)
    if (!ind?.kalman) continue

    const zScore = ind.kalman.zScore
    const pnlPct = parseFloat(pos.unrealized_plpc)

    // Priority 1: position already completed its mean reversion objective
    if (zScore >= -0.8) {
      exitCandidates.push({ symbol: pos.symbol, reason: `z-score ${zScore.toFixed(3)} reverted to fair value`, priority: 1 })
    }
    // Priority 2: position profitable and new setup has very high confidence
    else if (pnlPct > 0.05 && newSignal.confidence > 0.80) {
      exitCandidates.push({ symbol: pos.symbol, reason: `Rotating to better setup (P&L +${(pnlPct * 100).toFixed(1)}%, new confidence ${newSignal.confidence.toFixed(2)})`, priority: 2 })
    }
  }

  if (exitCandidates.length === 0) {
    return { rotate: false, reason: 'No rotation candidates — all positions still in progress' }
  }

  const toExit = exitCandidates.sort((a, b) => a.priority - b.priority)[0]
  return { rotate: true, exitSymbol: toExit.symbol, reason: toExit.reason }
}
