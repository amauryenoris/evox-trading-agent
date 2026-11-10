import type { AlpacaPosition, OpenPositionContext, TechnicalIndicators } from '../../../types'
import type { Quote } from './world'

type Kalman = NonNullable<TechnicalIndicators['kalman']>

export function kalman(zScore: number, signal: Kalman['signal'] = 'NEUTRAL'): Kalman {
  return { stateEstimate: 100, forecastError: zScore, errorStdDev: 1, zScore, signal }
}

// Neutral baseline: no setup fires. Each scenario overrides only the fields that select its setup.
export function makeIndicators(overrides: Partial<TechnicalIndicators> = {}): TechnicalIndicators {
  return {
    rsi: 50, macd: { macdLine: 0, signalLine: 0, histogram: 0 },
    bollingerBands: { upper: 110, middle: 100, lower: 90, percentB: 0.5 },
    sma50: 100, sma200: 100, ema50: 105, ema200: 110, distanceToEma50Pct: -4.8, kalman: kalman(0),
    currentPrice: 100, volume: 2_000_000, prevDayVolume: 5_000_000, adx: 25, atr: 2, atrPercentile: 0.5,
    marketRegime: 'TRENDING', prevClose: 100, ema50Prev: 105, sma5: 100, closeMinus2: 100, closeMinus3: 100, closeMinus4: 100,
    ...overrides,
  }
}

// MEAN_REVERSION setup: z below the entry threshold in a RANGING regime with ADX above the gate floor.
export function mrIndicators(overrides: Partial<TechnicalIndicators> = {}): TechnicalIndicators {
  return makeIndicators({
    rsi: 30, bollingerBands: { upper: 60, middle: 52, lower: 44, percentB: 0.1 }, currentPrice: 50, ema50: 55, ema200: 60,
    kalman: kalman(-2.4, 'MEAN_REVERSION_LONG'), marketRegime: 'RANGING', adx: 22, prevClose: 51, ema50Prev: 55,
    ...overrides,
  })
}

// TREND_PULLBACK_3DAY setup: above SMA200, three prior down-closes, price at or below SMA5, no trend structure.
export function trend3DayIndicators(overrides: Partial<TechnicalIndicators> = {}): TechnicalIndicators {
  return makeIndicators({
    currentPrice: 100, sma200: 90, ema50: 105, ema200: 110, sma5: 101, prevClose: 99, closeMinus2: 100, closeMinus3: 101, closeMinus4: 102,
    kalman: kalman(-0.5), marketRegime: 'TRENDING', adx: 25,
    ...overrides,
  })
}

export function quote(overrides: Partial<Quote> = {}): Quote {
  return { bid: 49.95, ask: 50, spread: 0.05, spreadBps: 10, fresh: true, ...overrides }
}

export function position(symbol: string, overrides: Partial<AlpacaPosition> = {}): AlpacaPosition {
  return {
    asset_id: `asset-${symbol}`, symbol, exchange: 'NASDAQ', asset_class: 'us_equity', avg_entry_price: '100', qty: '10',
    side: 'long', market_value: '1000', cost_basis: '1000', unrealized_pl: '10', unrealized_plpc: '0.01',
    unrealized_intraday_pl: '0', unrealized_intraday_plpc: '0', current_price: '101', lastday_price: '100', change_today: '0',
    ...overrides,
  }
}

export function context(symbol: string, overrides: Partial<OpenPositionContext> = {}): OpenPositionContext {
  return {
    symbol, buyTimestamp: '2026-11-02T15:00:00.000Z', buyPrice: 100, quantity: 10,
    indicators: makeIndicators(), claudeReasoning: 'scripted entry', patternIdsUsed: [], stopOrderId: `stop-${symbol}`,
    signalType: 'TREND_PULLBACK', highSinceEntry: 101, trailingStop: null, trailingActivated: false,
    ...overrides,
  }
}

// TREND_PULLBACK setup: uptrend structure, z <= 0, rising EMA50, ADX >= 20 and MACD histogram above the -2.0 floor.
export function trendPullbackIndicators(overrides: Partial<TechnicalIndicators> = {}): TechnicalIndicators {
  return makeIndicators({
    currentPrice: 100, ema50: 95, ema200: 90, ema50Prev: 94, prevClose: 99,
    kalman: kalman(-0.5), marketRegime: 'TRENDING', adx: 25, macd: { macdLine: 0.5, signalLine: 0, histogram: 0.5 },
    ...overrides,
  })
}

// TREND_ZLE05 setup: same uptrend, 0 < z <= 1.25, ADX >= 20 (the PULLBACK quality filter also applies, see scenario ad-2) and a positive histogram.
export function trendZle05Indicators(overrides: Partial<TechnicalIndicators> = {}): TechnicalIndicators {
  return trendPullbackIndicators({ kalman: kalman(0.5), adx: 22, ...overrides })
}

// EMA_RECLAIM setup: price above a rising EMA50 by more than 0.2% after a close at or below the previous EMA50, z < 0, no uptrend structure.
export function emaReclaimIndicators(overrides: Partial<TechnicalIndicators> = {}): TechnicalIndicators {
  return makeIndicators({
    currentPrice: 100, ema50: 99.5, ema50Prev: 99.4, ema200: 105, prevClose: 99,
    kalman: kalman(-0.2), marketRegime: 'TRENDING', adx: 25, macd: { macdLine: 0.5, signalLine: 0, histogram: 0.5 },
    ...overrides,
  })
}
