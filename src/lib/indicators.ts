import type { AlpacaBar, TechnicalIndicators, MarketRegime } from './types'

// ============================================================
// EMA helper (used internally by MACD)
// ============================================================

function calculateEMA(values: number[], period: number): number[] {
  if (values.length < period) return []
  const k = 2 / (period + 1)
  const ema: number[] = []

  // Seed with SMA of first `period` values
  const seed = values.slice(0, period).reduce((s, v) => s + v, 0) / period
  ema.push(seed)

  for (let i = period; i < values.length; i++) {
    ema.push(values[i] * k + ema[ema.length - 1] * (1 - k))
  }
  return ema
}

// ============================================================
// RSI(14) — Wilder's smoothing method
// ============================================================

export function calculateRSI(bars: AlpacaBar[], period = 14): number | null {
  if (bars.length < period + 1) return null

  const closes = bars.map((b) => b.c)
  const changes: number[] = []
  for (let i = 1; i < closes.length; i++) {
    changes.push(closes[i] - closes[i - 1])
  }

  let avgGain = 0
  let avgLoss = 0

  // First average: simple mean of first `period` changes
  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) avgGain += changes[i]
    else avgLoss += Math.abs(changes[i])
  }
  avgGain /= period
  avgLoss /= period

  // Wilder's smoothing for the rest
  for (let i = period; i < changes.length; i++) {
    const gain = changes[i] > 0 ? changes[i] : 0
    const loss = changes[i] < 0 ? Math.abs(changes[i]) : 0
    avgGain = (avgGain * (period - 1) + gain) / period
    avgLoss = (avgLoss * (period - 1) + loss) / period
  }

  if (avgLoss === 0) return 100
  const rs = avgGain / avgLoss
  return 100 - 100 / (1 + rs)
}

// ============================================================
// MACD(12, 26, 9)
// ============================================================

export function calculateMACD(bars: AlpacaBar[]): {
  macdLine: number
  signalLine: number
  histogram: number
} | null {
  if (bars.length < 35) return null // need at least 26 + 9

  const closes = bars.map((b) => b.c)
  const ema12 = calculateEMA(closes, 12)
  const ema26 = calculateEMA(closes, 26)

  // ema12 starts at index 11 of closes, ema26 starts at index 25
  // Align them: both refer to closes[25..] onward
  const ema12Aligned = ema12.slice(ema26.length - ema12.length + (26 - 12))
  // Actually: ema26[i] corresponds to closes[25 + i], ema12[i] corresponds to closes[11 + i]
  // So to align: for ema26[i], the matching ema12 index is i + (26 - 12) = i + 14
  const macdLine: number[] = []
  for (let i = 0; i < ema26.length; i++) {
    const ema12Idx = i + 14
    if (ema12Idx < ema12.length) {
      macdLine.push(ema12[ema12Idx] - ema26[i])
    }
  }

  if (macdLine.length < 9) return null

  const signalEMA = calculateEMA(macdLine, 9)
  if (signalEMA.length === 0) return null

  const lastMACD = macdLine[macdLine.length - 1]
  const lastSignal = signalEMA[signalEMA.length - 1]

  return {
    macdLine: lastMACD,
    signalLine: lastSignal,
    histogram: lastMACD - lastSignal,
  }
}

// ============================================================
// Bollinger Bands(20, 2)
// ============================================================

export function calculateBollingerBands(
  bars: AlpacaBar[],
  period = 20,
  stdDevMult = 2
): { upper: number; middle: number; lower: number; percentB: number } | null {
  if (bars.length < period) return null

  const slice = bars.slice(-period).map((b) => b.c)
  const sma = slice.reduce((s, v) => s + v, 0) / period

  const variance = slice.reduce((s, v) => s + Math.pow(v - sma, 2), 0) / period
  const stdDev = Math.sqrt(variance)

  const upper = sma + stdDevMult * stdDev
  const lower = sma - stdDevMult * stdDev
  const currentPrice = bars[bars.length - 1].c
  const percentB = (upper - lower) === 0 ? 0.5 : (currentPrice - lower) / (upper - lower)

  return { upper, middle: sma, lower, percentB }
}

// ============================================================
// Simple Moving Average
// ============================================================

export function calculateSMA(bars: AlpacaBar[], period: number): number | null {
  if (bars.length < period) return null
  const slice = bars.slice(-period)
  return slice.reduce((s, b) => s + b.c, 0) / period
}

// ============================================================
// Kalman Filter — adaptive fair price estimator (E.P. Chan)
// Adapted for single-asset mean reversion detection
// ============================================================

export function calculateKalman(
  bars: AlpacaBar[],
  entryStd = 1.3,
  exitStd = 0.5
): TechnicalIndicators['kalman'] {
  if (bars.length < 30) return null

  const closes = bars.map((b) => b.c)

  // Derive observation noise R from actual return variance
  const returns: number[] = []
  for (let i = 1; i < closes.length; i++) {
    returns.push((closes[i] - closes[i - 1]) / closes[i - 1])
  }
  const retMean = returns.reduce((s, r) => s + r, 0) / returns.length
  const R = returns.reduce((s, r) => s + Math.pow(r - retMean, 2), 0) / returns.length
  const Q = R * 0.01 // process noise: state evolves slowly (1% of observation noise)

  // Initialize filter
  let x = closes[0] // state estimate = fair price
  let P = R         // initial error covariance

  const forecastErrors: number[] = []

  for (let i = 1; i < closes.length; i++) {
    // Prediction step
    const P_pred = P + Q

    // Kalman gain
    const K = P_pred / (P_pred + R)

    // Forecast error before update
    const e = closes[i] - x
    forecastErrors.push(e)

    // Update step
    x = x + K * e
    P = (1 - K) * P_pred
  }

  // Dynamic error std dev from rolling window (last 30 observations)
  const windowErrors = forecastErrors.slice(-30)
  const errMean = windowErrors.reduce((s, e) => s + e, 0) / windowErrors.length
  const errVar = windowErrors.reduce((s, e) => s + Math.pow(e - errMean, 2), 0) / windowErrors.length
  const errorStdDev = Math.sqrt(errVar)

  const forecastError = forecastErrors[forecastErrors.length - 1]
  const zScore = errorStdDev === 0 ? 0 : forecastError / errorStdDev

  let signal: 'MEAN_REVERSION_LONG' | 'EXIT_LONG' | 'NEUTRAL'
  if (zScore < -entryStd) {
    signal = 'MEAN_REVERSION_LONG' // price far below fair value — potential bounce
  } else if (zScore >= -exitStd) {
    signal = 'EXIT_LONG'           // price reverted to fair value — exit zone
  } else {
    signal = 'NEUTRAL'
  }

  return { stateEstimate: x, forecastError, errorStdDev, zScore, signal }
}

// ============================================================
// ATR(14) — True Range with Wilder smoothing
// ============================================================

export function calculateATR(bars: AlpacaBar[], period = 14): number | null {
  if (bars.length < period + 1) return null

  const trueRanges: number[] = []
  for (let i = 1; i < bars.length; i++) {
    const high = bars[i].h
    const low = bars[i].l
    const prevClose = bars[i - 1].c
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose))
    trueRanges.push(tr)
  }

  // Seed with simple mean of first `period` TRs
  let atr = trueRanges.slice(0, period).reduce((s, v) => s + v, 0) / period

  // Wilder's smoothing
  for (let i = period; i < trueRanges.length; i++) {
    atr = (atr * (period - 1) + trueRanges[i]) / period
  }

  return atr
}

// ============================================================
// ADX(14) — Average Directional Index with Wilder smoothing
// ============================================================

export function calculateADX(bars: AlpacaBar[], period = 14): number | null {
  if (bars.length < period * 2 + 1) return null

  const plusDM: number[] = []
  const minusDM: number[] = []
  const trueRanges: number[] = []

  for (let i = 1; i < bars.length; i++) {
    const upMove = bars[i].h - bars[i - 1].h
    const downMove = bars[i - 1].l - bars[i].l

    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0)
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0)

    const high = bars[i].h
    const low = bars[i].l
    const prevClose = bars[i - 1].c
    trueRanges.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)))
  }

  // Seed smoothed values
  let smoothedTR = trueRanges.slice(0, period).reduce((s, v) => s + v, 0)
  let smoothedPlusDM = plusDM.slice(0, period).reduce((s, v) => s + v, 0)
  let smoothedMinusDM = minusDM.slice(0, period).reduce((s, v) => s + v, 0)

  const dxValues: number[] = []

  for (let i = period; i < trueRanges.length; i++) {
    smoothedTR = smoothedTR - smoothedTR / period + trueRanges[i]
    smoothedPlusDM = smoothedPlusDM - smoothedPlusDM / period + plusDM[i]
    smoothedMinusDM = smoothedMinusDM - smoothedMinusDM / period + minusDM[i]

    const plusDI = smoothedTR === 0 ? 0 : (smoothedPlusDM / smoothedTR) * 100
    const minusDI = smoothedTR === 0 ? 0 : (smoothedMinusDM / smoothedTR) * 100
    const diSum = plusDI + minusDI
    const dx = diSum === 0 ? 0 : (Math.abs(plusDI - minusDI) / diSum) * 100
    dxValues.push(dx)
  }

  if (dxValues.length < period) return null

  // Seed ADX with simple mean of first `period` DX values
  let adx = dxValues.slice(0, period).reduce((s, v) => s + v, 0) / period

  // Wilder's smoothing for the rest
  for (let i = period; i < dxValues.length; i++) {
    adx = (adx * (period - 1) + dxValues[i]) / period
  }

  return adx
}

// ============================================================
// ATR Percentile — position of current ATR in recent history
// ============================================================

export function getATRPercentile(currentATR: number, allATRValues: number[]): number {
  if (allATRValues.length === 0) return 0.5
  const below = allATRValues.filter((v) => v <= currentATR).length
  return below / allATRValues.length
}

// ============================================================
// Market Regime Detection
// ============================================================

export function detectMarketRegime(
  adx: number | null,
  atrPercentile: number | null
): MarketRegime {
  if (atrPercentile !== null && atrPercentile > 0.80) return 'HIGH_VOLATILITY'
  if (adx !== null && adx > 30) return 'TRENDING'
  if (adx !== null && adx >= 20) return 'TRANSITION'
  return 'RANGING'
}

// ============================================================
// Aggregate: calculate all indicators at once
// ============================================================

export function calculateAllIndicators(bars: AlpacaBar[]): TechnicalIndicators {
  const atr = calculateATR(bars)
  const adx = calculateADX(bars)

  // Build rolling ATR history for percentile calculation
  const atrHistory: number[] = []
  for (let i = 30; i <= bars.length; i++) {
    const slice = bars.slice(0, i)
    const val = calculateATR(slice)
    if (val !== null) atrHistory.push(val)
  }

  const atrPercentile = atr !== null ? getATRPercentile(atr, atrHistory) : null
  const marketRegime = detectMarketRegime(adx, atrPercentile)

  const closes = bars.map((b) => b.c)
  const ema50Arr = calculateEMA(closes, 50)
  const ema200Arr = calculateEMA(closes, 200)
  const ema50 = ema50Arr.length > 0 ? ema50Arr[ema50Arr.length - 1] : null
  const ema50Prev = ema50Arr.length >= 2 ? ema50Arr[ema50Arr.length - 2] : null
  const ema200 = ema200Arr.length > 0 ? ema200Arr[ema200Arr.length - 1] : null
  const currentPrice = bars[bars.length - 1].c
  const distanceToEma50Pct = ema50 !== null ? ((currentPrice - ema50) / ema50) * 100 : null

  return {
    rsi: calculateRSI(bars),
    macd: calculateMACD(bars),
    bollingerBands: calculateBollingerBands(bars),
    sma50: calculateSMA(bars, 50),
    sma200: calculateSMA(bars, 200),
    ema50,
    ema50Prev,
    ema200,
    distanceToEma50Pct,
    prevClose: bars.length >= 2 ? bars[bars.length - 2].c : null,
    kalman: calculateKalman(bars),
    currentPrice,
    volume: bars[bars.length - 1].v,
    prevDayVolume: bars.length >= 2 ? bars[bars.length - 2].v : bars[bars.length - 1].v,
    adx,
    atr,
    atrPercentile,
    marketRegime,
  }
}
