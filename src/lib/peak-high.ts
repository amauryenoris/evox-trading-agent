import { getBars } from './alpaca'
import type { AlpacaBar } from './types'

// Longest gap between two checks that still touches a regular session: 15:55 ET sweep -> 09:30 ET next day.
// One call for the whole window costs a single request per position and fits in one page of 1-minute bars.
export const PEAK_LOOKBACK_MS = 18 * 60 * 60 * 1000
const PEAK_BARS_LIMIT = 1000
const SESSION_OPEN_MINUTE = 9 * 60 + 30
const SESSION_CLOSE_MINUTE = 16 * 60

// Bad-print guards: a bar's high may not count above close x ratio, and a candidate may not exceed the
// stored high by more than this many percentage points of entry within one check.
export const PEAK_CLOSE_CAP_RATIO = 1.01
export const PEAK_MAX_JUMP_PP = 10

const ET_CLOCK = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  hour: 'numeric',
  minute: 'numeric',
  hourCycle: 'h23',
})

export interface PeakGuardInput {
  storedHigh: number
  entry: number
}

function minuteOfDayET(iso: string): number | null {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  const parts = ET_CLOCK.formatToParts(date)
  const hour = Number(parts.find((p) => p.type === 'hour')?.value)
  const minute = Number(parts.find((p) => p.type === 'minute')?.value)
  return hour * 60 + minute
}

function isRegularSession(bar: AlpacaBar): boolean {
  const minute = minuteOfDayET(bar.t)
  return minute !== null && minute >= SESSION_OPEN_MINUTE && minute < SESSION_CLOSE_MINUTE
}

function cappedHigh(bar: AlpacaBar): number | null {
  if (![bar.h, bar.c, bar.v].every(Number.isFinite) || bar.v <= 0) return null
  return Math.min(bar.h, bar.c * PEAK_CLOSE_CAP_RATIO)
}

export interface PeakScan {
  peak: number | null
  largestRejected: number | null
}

export function scanRegularSessionHighs(bars: AlpacaBar[], maxHigh: number = Number.POSITIVE_INFINITY): PeakScan {
  let peak: number | null = null
  let largestRejected: number | null = null
  for (const bar of bars) {
    const high = isRegularSession(bar) ? cappedHigh(bar) : null
    if (high === null) continue
    if (high > maxHigh) {
      if (largestRejected === null || high > largestRejected) largestRejected = high
      continue
    }
    if (peak === null || high > peak) peak = high
  }
  return { peak, largestRejected }
}

export function maxRegularSessionHigh(bars: AlpacaBar[], maxHigh?: number): number | null {
  return scanRegularSessionHighs(bars, maxHigh).peak
}

function isUsableGuard(guard: PeakGuardInput | undefined): guard is PeakGuardInput {
  return guard !== undefined && Number.isFinite(guard.storedHigh) && guard.storedHigh > 0 && Number.isFinite(guard.entry) && guard.entry > 0
}

export async function getPeakHighSinceLastCheck(
  symbol: string,
  buyTimestamp: string,
  now: Date = new Date(),
  guard?: PeakGuardInput,
): Promise<number | null> {
  const buyMs = new Date(buyTimestamp).getTime()
  if (Number.isNaN(buyMs)) return null

  const startMs = Math.max(buyMs, now.getTime() - PEAK_LOOKBACK_MS)
  try {
    const bars = await getBars(symbol, '1Min', 0, PEAK_BARS_LIMIT, new Date(startMs).toISOString())
    if (!isUsableGuard(guard)) return maxRegularSessionHigh(bars)

    const limit = guard.storedHigh + (PEAK_MAX_JUMP_PP / 100) * guard.entry
    const { peak, largestRejected } = scanRegularSessionHighs(bars, limit)
    if (largestRejected !== null) {
      console.warn(
        `[PEAK-HIGH] ${symbol} rejected 1-minute high ${largestRejected} — above jump limit ${limit} ` +
        `(stored high ${guard.storedHigh}, entry ${guard.entry}, max jump ${PEAK_MAX_JUMP_PP} pp)`
      )
    }
    return peak
  } catch (err) {
    console.warn(`[PEAK-HIGH] 1-minute bars unavailable for ${symbol} — keeping per-cycle price sample:`, err)
    return null
  }
}
