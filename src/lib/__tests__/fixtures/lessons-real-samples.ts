import type { TechnicalIndicators, TradeEvaluation } from '../../types'
import type { SetupLearningInput } from '../../learning-context'

// Real lesson texts written by the post-mortem step (STEP 0, 2026-10-21), used as test inputs.
export const REAL_LESSONS = {
  neverAdx30:
    'Never execute a mean-reversion trade when ADX exceeds 30; a high ADX explicitly signals that trend-following, not reversion, is the dominant regime, and oversold readings in this context are continuation signals, not reversal signals.',
  veto:
    "When the original buy reasoning explicitly enumerates multiple bearish counter-signals, treat that as a veto condition rather than a caveat — if the system's own logic flags the trade as high-risk, the entry threshold should be raised or the trade skipped entirely.",
  hardFilter:
    'When a directly matching historical trade pattern produced a loss and the lesson explicitly flags elevated mean-reversion risk, that signal must be treated as a hard filter or significant position-size reducer, not an advisory footnote to override.',
  avoidEntries:
    'Avoid trend-continuation entries when the Kalman z-score is above +1.0; this signals price is already stretched and the risk/reward is unfavorable regardless of trend strength.',
  notHardGate:
    'Sector underperformance (XLK vs SPY) is a soft caution flag rather than a hard gate for this setup — the trade succeeded despite the -4.96% sector drag, reinforcing that this pure price-action setup should not be blocked solely by sector filters.',
  notDisqualifying:
    'A bearish MACD histogram at entry is an expected and acceptable condition for pullback setups — it reflects the pullback itself — and should not be used as a disqualifying signal when RSI remains in neutral territory rather than overbought exhaustion.',
  strongDowntrend:
    'When entering a mean-reversion long against a strong downtrend, pre-defining a conservative profit target anchored to partial fair-value reversion (rather than full fair value) and a tight stop-loss is essential, as the probabilistic edge remains negative and capital preservation must be prioritized over maximizing individual winners.',
  stronglyTrending:
    'Kalman filter z-score signals below -1.3 can generate profitable mean-reversion trades even when momentum indicators are bearish, provided the volatility regime is moderate (ATR percentile below ~50th) and the market structure is ranging rather than strongly trending.',
  cleanOne:
    'Extreme Kalman filter z-scores (below -2.5) combined with RSI below 30 and %B below 0 can generate profitable short-term mean-reversion trades even in sustained downtrends, but profits tend to be limited and exits should be managed tightly.',
  cleanTwo:
    'A deeply negative MACD histogram combined with a weak ADX reading is a contra-indicator for mean-reversion pullback entries, signaling that momentum is still actively declining rather than pausing within a healthy uptrend.',
  cleanThree:
    'Price remaining well above SMA200 during a short-term pullback is a critical filter for TREND_PULLBACK setups; it distinguishes healthy retracements from potential trend breaks.',
  cleanFour:
    'Entering pullbacks at neutral RSI levels (50-60) and mid-range %B (0.40-0.55) rather than extended readings improves the probability of a successful mean-reversion in trend-following setups.',
} as const

export function fixtureIndicators(overrides: Partial<TechnicalIndicators> = {}): TechnicalIndicators {
  return {
    rsi: null,
    macd: { macdLine: 0, signalLine: 0, histogram: -1 },
    bollingerBands: null,
    sma50: null,
    sma200: null,
    ema50: 100,
    ema200: null,
    distanceToEma50Pct: null,
    kalman: { stateEstimate: 100, forecastError: 0, errorStdDev: 1, zScore: -1.5, signal: 'NEUTRAL' },
    currentPrice: 100,
    volume: 0,
    prevDayVolume: 0,
    adx: 20,
    atr: null,
    atrPercentile: 0.5,
    marketRegime: 'RANGING',
    ...overrides,
  }
}

function fixtureTrade(id: string, overrides: Partial<TradeEvaluation>): TradeEvaluation {
  return {
    id,
    symbol: 'AAPL',
    buyTimestamp: '2026-09-01T14:00:00Z',
    sellTimestamp: '2026-09-05T14:00:00Z',
    buyPrice: 100,
    sellPrice: 105,
    quantity: 10,
    pnlUSD: 500,
    pnlPct: 5,
    holdingDays: 4,
    signal_type: 'MEAN_REVERSION',
    stateFingerprint: null,
    buyIndicators: fixtureIndicators(),
    claudePostMortem: '',
    lessonsLearned: [],
    outcome: 'profit',
    ...overrides,
  }
}

function fingerprint(adx: string, macd: string) {
  return { signal_type: 'MEAN_REVERSION', spx_regime: null, market_regime: 'RANGING', adx_bucket: adx, z_bucket: 'DEEP', macd_bucket: macd, atr_bucket: 'MID' }
}

function mrHistory(): TradeEvaluation[] {
  const lessonSets: string[][] = [
    [REAL_LESSONS.cleanOne, REAL_LESSONS.cleanTwo, REAL_LESSONS.veto],
    [REAL_LESSONS.neverAdx30, REAL_LESSONS.cleanThree, REAL_LESSONS.cleanFour],
    [REAL_LESSONS.hardFilter, REAL_LESSONS.notHardGate, REAL_LESSONS.cleanOne],
  ]
  return Array.from({ length: 16 }, (_, i) =>
    fixtureTrade(`mr-${i}`, {
      symbol: `M${i}`,
      pnlPct: (i < 8 ? 1 : -1) + i * 0.1,
      stateFingerprint: fingerprint(i < 8 ? 'MID' : 'LOW', i % 2 === 0 ? 'NEGATIVE' : 'POSITIVE'),
      sellTimestamp: `2026-09-${String(10 + i).padStart(2, '0')}T14:00:00Z`,
      lessonsLearned: i >= 13 ? lessonSets[i - 13] : [],
    })
  )
}

function threeDayHistory(): TradeEvaluation[] {
  return [
    fixtureTrade('3d-1', { symbol: 'NVDA', signal_type: 'TREND_PULLBACK_3DAY', sellTimestamp: '2026-10-01T14:00:00Z', pnlPct: 2, lessonsLearned: [REAL_LESSONS.cleanThree, REAL_LESSONS.cleanFour, REAL_LESSONS.notDisqualifying] }),
    fixtureTrade('3d-2', { symbol: 'FCX', signal_type: 'TREND_PULLBACK_3DAY', sellTimestamp: '2026-10-05T14:00:00Z', pnlPct: -1, lessonsLearned: [REAL_LESSONS.avoidEntries, REAL_LESSONS.cleanTwo, REAL_LESSONS.cleanOne] }),
    fixtureTrade('3d-3', { symbol: 'INTC', signal_type: 'TREND_PULLBACK_3DAY', sellTimestamp: '2026-10-08T14:00:00Z', pnlPct: 3, lessonsLearned: [REAL_LESSONS.notHardGate, REAL_LESSONS.cleanFour, REAL_LESSONS.cleanThree] }),
  ]
}

export interface RegressionCase { name: string; input: SetupLearningInput }

const ASOF = '2026-10-21T14:00:00-04:00'

export function buildRegressionCases(): RegressionCase[] {
  return [
    {
      name: 'MR with confirmatory and exploratory buckets and 3 lessons on the newest trades',
      input: { setup: 'MEAN_REVERSION', symbol: 'ZZZ', indicators: fixtureIndicators(), asOf: ASOF, trades: mrHistory() },
    },
    {
      name: '3DAY with three eligible trades',
      input: { setup: 'TREND_PULLBACK_3DAY', symbol: 'NVDA', indicators: fixtureIndicators(), asOf: ASOF, trades: threeDayHistory() },
    },
    {
      name: 'setup with no closed trades',
      input: { setup: 'TREND_ZLE05', symbol: 'ZZZ', indicators: fixtureIndicators(), asOf: ASOF, trades: threeDayHistory() },
    },
  ]
}
