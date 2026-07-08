export function getAdxBucket(adx: number | null): string | null {
  if (adx === null || !Number.isFinite(adx)) return null
  if (adx < 18) return 'LOW'
  if (adx < 25) return 'MID'
  return 'HIGH'
}

export function getMacdBucket(macd: number | null): string | null {
  if (macd === null || !Number.isFinite(macd)) return null
  if (macd > 0) return 'POSITIVE'
  if (macd < -2) return 'DEEP_NEGATIVE'
  return 'NEGATIVE'
}

export function getZBucket(
  z: number | null,
  signalType:
    | 'MEAN_REVERSION'
    | 'TREND_PULLBACK'
    | 'TREND_ZLE05'
    | 'EMA_RECLAIM'
    | null
): string | null {
  if (z === null || !Number.isFinite(z)) return null
  if (signalType === 'MEAN_REVERSION') {
    if (z < -1.5) return 'DEEP'
    if (z < -1.2) return 'STANDARD'
    return 'SHALLOW'
  }
  if (signalType === 'TREND_PULLBACK' || signalType === 'TREND_ZLE05') {
    if (z > 1.25) return 'BREAKOUT'
    if (z >= 1.0) return 'CONTINUATION'
    if (z >= 0) return 'CHOP'
    return 'PULLBACK'
  }
  return null
}

export function computeSpxSnapshot(bars: { t: string; c: number }[]): {
  spx_price: number | null
  spx_sma50: number | null
  spx_sma200: number | null
  spx_regime: string | null
} {
  if (bars.length < 2) {
    return { spx_price: null, spx_sma50: null, spx_sma200: null, spx_regime: null }
  }

  // bars.length - 2 = previous confirmed close (no lookahead bias)
  // bars.length - 1 = current day partial bar (excluded)
  const refIndex = bars.length - 2
  const spx_price = bars[refIndex].c

  function smaAt(
    arr: { c: number }[],
    idx: number,
    period: number
  ): number | null {
    if (idx < period - 1) return null
    const slice = arr.slice(idx - period + 1, idx + 1)
    return slice.reduce((a, b) => a + b.c, 0) / period
  }

  const spx_sma50  = smaAt(bars, refIndex, 50)
  const spx_sma200 = smaAt(bars, refIndex, 200)

  if (spx_sma50 === null || spx_sma200 === null) {
    return { spx_price, spx_sma50: null, spx_sma200: null, spx_regime: null }
  }

  const spx_regime =
    spx_price > spx_sma200 ? 'BULL'
    : spx_price > spx_sma50 ? 'CAUTION'
    : 'BEAR'

  return { spx_price, spx_sma50, spx_sma200, spx_regime }
}
