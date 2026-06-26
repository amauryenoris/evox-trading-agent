/**
 * Pure SPY-snapshot helpers shared by backfill scripts that compute spx_price/
 * spx_sma50/spx_sma200/spx_regime as of a given timestamp, with no lookahead bias.
 *
 * Extracted as a fresh copy for scripts/backfill-spx-regime-open-positions.ts —
 * scripts/backfill-spx-regime.ts is left untouched (its own copy of this logic
 * is private/inlined and must not be modified).
 */

export interface SpyBar {
  date: string
  close: number
}

export function toEtDate(isoTimestamp: string): string {
  return new Date(isoTimestamp).toLocaleDateString('en-CA', {
    timeZone: 'America/New_York',
  })
}

export function smaAtIndex(closes: number[], index: number, period: number): number | null {
  if (index < period - 1) return null
  const slice = closes.slice(index - period + 1, index + 1)
  return slice.reduce((a, b) => a + b, 0) / period
}

export function findPriorBarIndex(bars: SpyBar[], etDate: string): number {
  for (let j = bars.length - 1; j >= 0; j--) {
    if (bars[j].date < etDate) return j
  }
  return -1
}

export function classifyRegime(
  spyClose: number,
  sma50: number,
  sma200: number
): 'BULL' | 'CAUTION' | 'BEAR' {
  if (spyClose > sma200) return 'BULL'
  if (spyClose > sma50) return 'CAUTION'
  return 'BEAR'
}
