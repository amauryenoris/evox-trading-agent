import { getBars } from './alpaca'
import type { AlpacaBar } from './types'

// Longest gap between two checks that still touches a regular session: 15:55 ET sweep -> 09:30 ET next day.
// One call for the whole window costs a single request per position and fits in one page of 1-minute bars.
export const PEAK_LOOKBACK_MS = 18 * 60 * 60 * 1000
const PEAK_BARS_LIMIT = 1000
const SESSION_OPEN_MINUTE = 9 * 60 + 30
const SESSION_CLOSE_MINUTE = 16 * 60

const ET_CLOCK = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  hour: 'numeric',
  minute: 'numeric',
  hourCycle: 'h23',
})

function minuteOfDayET(iso: string): number | null {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  const parts = ET_CLOCK.formatToParts(date)
  const hour = Number(parts.find((p) => p.type === 'hour')?.value)
  const minute = Number(parts.find((p) => p.type === 'minute')?.value)
  return hour * 60 + minute
}

export function maxRegularSessionHigh(bars: AlpacaBar[]): number | null {
  let max: number | null = null
  for (const bar of bars) {
    const minute = minuteOfDayET(bar.t)
    if (minute === null || minute < SESSION_OPEN_MINUTE || minute >= SESSION_CLOSE_MINUTE) continue
    if (max === null || bar.h > max) max = bar.h
  }
  return max
}

export async function getPeakHighSinceLastCheck(
  symbol: string,
  buyTimestamp: string,
  now: Date = new Date(),
): Promise<number | null> {
  const buyMs = new Date(buyTimestamp).getTime()
  if (Number.isNaN(buyMs)) return null

  const startMs = Math.max(buyMs, now.getTime() - PEAK_LOOKBACK_MS)
  try {
    const bars = await getBars(symbol, '1Min', 0, PEAK_BARS_LIMIT, new Date(startMs).toISOString())
    return maxRegularSessionHigh(bars)
  } catch (err) {
    console.warn(`[PEAK-HIGH] 1-minute bars unavailable for ${symbol} — keeping per-cycle price sample:`, err)
    return null
  }
}
