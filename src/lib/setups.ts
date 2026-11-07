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
    criteria: 'Previous close above SMA200 (uptrend) with 3 consecutive lower daily closes ending at the previous close; price not above SMA5. No z-score, ADX, or MACD condition.',
    active: true,
  },
  {
    name: 'MEAN_REVERSION',
    criteria: 'Z-score <= -1.3 (or news-adjusted threshold); not taken when the regime is RANGING and ADX < 18.',
    active: true,
  },
  {
    name: 'TREND_PULLBACK',
    criteria: 'Uptrend structure (price > EMA50 > EMA200), z-score <= 0, EMA50 slope rising, ADX >= 20 (or ADX unavailable), MACD histogram > -2.0, momentum confirmed.',
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
