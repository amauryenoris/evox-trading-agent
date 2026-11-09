import type { ExitReason } from './types'

export function getTradingDaysOpen(buyTimestamp: string): number {
  const msPerDay = 1000 * 60 * 60 * 24
  const elapsed = Date.now() - new Date(buyTimestamp).getTime()
  const calendarDays = elapsed / msPerDay
  // Approximate: 5/7 of calendar days are trading days
  return Math.floor(calendarDays * (5 / 7))
}

// NOTE: Market close uses fixed 21:00 UTC approximation (EDT).
// EST (winter) drifts by ~1h — acceptable for cooldown purposes.
// Precision goal: prevent same-day re-entry, not exact exchange timing.
// Fase 3: replace with proper timezone library if precision required.
export function computeCooldownUntil(
  reason: ExitReason,
  endOfTradingDay: Date,
  nextTradingDay1: Date,
  nextTradingDay3: Date
): Date | null {
  switch (reason) {
    case 'Z_SCORE_EXIT':
    case 'PROFIT_TARGET':
    case 'SMA5_RECLAIM':
      return endOfTradingDay
    case 'TRAILING_STOP':
    case 'EMA_FAILURE':
      return nextTradingDay1
    case 'STOP_LOSS':
      return nextTradingDay3
    case 'TIME_STOP':
    case 'UNKNOWN':
      return null
    default:
      return null
  }
}

export function toExitReason(reason?: string | null): ExitReason {
  if (!reason?.trim()) {
    console.warn(`[EXIT_REASON_EMPTY] raw="${String(reason)}"`)
    return 'UNKNOWN'
  }
  const r = reason.trim().toUpperCase().replace(/[-\s]/g, '_')
  if (r.includes('PROFIT_FLOOR'))     return 'TRAILING_STOP'
  if (r.includes('PROFIT_TARGET'))    return 'PROFIT_TARGET'
  if (r.includes('TIME_STOP'))        return 'TIME_STOP'
  if (r.includes('FAIR_VALUE'))       return 'Z_SCORE_EXIT'
  if (r.includes('MOVE_EXHAUSTED'))   return 'Z_SCORE_EXIT'
  if (r.includes('FELL_BELOW_EMA50')) return 'EMA_FAILURE'
  if (r.includes('TRAILING_STOP'))    return 'TRAILING_STOP'
  if (r.includes('CLOSED_ABOVE_SMA5')) return 'SMA5_RECLAIM'
  console.warn(`[EXIT_REASON_UNMATCHED] raw="${reason}"`)
  return 'UNKNOWN'
}
