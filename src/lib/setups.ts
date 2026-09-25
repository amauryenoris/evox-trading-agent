// Central list of the 5 live trading setups. Single source of truth for setup
// names — types.ts's SignalType is derived from this file's SetupName.
export interface SetupDefinition {
  name: string
  criteria: string
  active: boolean
}

export const ACTIVE_SETUPS = [
  {
    name: 'TREND_PULLBACK_3DAY',
    criteria: 'Price above SMA200 (uptrend) with exactly 3 consecutive lower daily closes immediately before entry; enters on the 4th day. No z-score, ADX, or MACD condition.',
    active: true,
  },
  {
    name: 'MEAN_REVERSION',
    criteria: 'Ranging market regime, z-score <= -1.3 (or news-adjusted threshold), RSI < 45, %B < 0.2.',
    active: true,
  },
  {
    name: 'TREND_PULLBACK',
    criteria: 'Uptrend structure (price > EMA50 > EMA200), z-score <= 0, EMA50 slope rising, ADX >= 20, momentum confirmed.',
    active: true,
  },
  {
    name: 'TREND_ZLE05',
    criteria: 'Uptrend structure (price > EMA50 > EMA200), 0 < z-score <= 1.25, EMA50 slope rising, ADX >= 18 (or >= 15 with MACD histogram > 0.25), MACD histogram positive.',
    active: true,
  },
  {
    name: 'EMA_RECLAIM',
    criteria: 'Price crossed above EMA50 from below (confirmed vs. prior day), z-score < 0, distance from EMA50 > 0.2%, momentum confirmed.',
    active: true,
  },
] as const satisfies SetupDefinition[]

export type SetupName = (typeof ACTIVE_SETUPS)[number]['name']
