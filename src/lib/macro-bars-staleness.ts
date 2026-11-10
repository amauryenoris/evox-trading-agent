import type { AlpacaBar } from './types'

export const STALE_MACRO_BARS_MAX_DAYS = 5

export function isMacroBarsStale(bars: { t: string }[], referenceDate: Date): boolean {
  if (bars.length === 0) return true
  const lastBarDate = new Date(bars[bars.length - 1].t)
  const ageDays = (referenceDate.getTime() - lastBarDate.getTime()) / (24 * 60 * 60 * 1000)
  return ageDays > STALE_MACRO_BARS_MAX_DAYS
}

export function guardMacroBars(symbol: string, bars: AlpacaBar[]): AlpacaBar[] {
  if (!isMacroBarsStale(bars, new Date())) return bars
  const lastBar = bars.length > 0 ? bars[bars.length - 1].t.split('T')[0] : 'none'
  const ageDays = bars.length > 0
    ? Math.floor((Date.now() - new Date(bars[bars.length - 1].t).getTime()) / (24 * 60 * 60 * 1000))
    : -1
  console.warn(`[STALE_MACRO_BARS] symbol=${symbol} lastBar=${lastBar} ageDays=${ageDays}`)
  return []
}
