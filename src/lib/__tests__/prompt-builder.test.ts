import { afterEach, describe, expect, it } from 'vitest'
import type { AlpacaAccount, AlpacaPosition, LearnContext, TechnicalIndicators } from '../types'
import type { AlpacaNewsArticle } from '../alpaca'
import * as legacy from './fixtures/legacy-prompt'
import { SYSTEM_PROMPT, bbLabel, buildEnrichedPrompt, kalmanLabel, macdLabel, rsiLabel, smaLabel, type PromptEnv } from '../prompt-builder'

const ENV_KEYS = ['MAX_POSITION_SIZE', 'MAX_POSITIONS', 'STOP_LOSS_PCT'] as const
const SAVED_ENV = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]))

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (SAVED_ENV[key] === undefined) delete process.env[key]
    else process.env[key] = SAVED_ENV[key]
  }
})

const ACCOUNT = { equity: '100000', cash: '50000', buying_power: '200000' } as AlpacaAccount
const POSITION = { symbol: 'XYZ', qty: '12', avg_entry_price: '48.5', unrealized_pl: '18', unrealized_plpc: '0.0309', current_price: '50' } as AlpacaPosition
const NO_ENV: PromptEnv = {}

function indicators(overrides: Partial<TechnicalIndicators> = {}): TechnicalIndicators {
  return {
    rsi: 28.4, macd: { macdLine: -0.5, signalLine: -0.3, histogram: -0.2 },
    bollingerBands: { upper: 130, middle: 125, lower: 120, percentB: -0.1 },
    sma50: 130, sma200: 120, ema50: 128, ema200: 126, distanceToEma50Pct: -3.5,
    kalman: { stateEstimate: 130, forecastError: -6.544, errorStdDev: 2.5, zScore: -2.6176, signal: 'MEAN_REVERSION_LONG' },
    currentPrice: 123.456, volume: 1234567, prevDayVolume: 5_000_000, adx: 22.5, atr: 3, atrPercentile: 0.75, marketRegime: 'RANGING',
    ...overrides,
  }
}

function nullIndicators(): TechnicalIndicators {
  return {
    rsi: null, macd: null, bollingerBands: null, sma50: null, sma200: null, ema50: null, ema200: null, distanceToEma50Pct: null,
    kalman: null, currentPrice: 50, volume: 1000, prevDayVolume: 5_000_000, adx: null, atr: null, atrPercentile: null, marketRegime: null,
  }
}

function prompt(overrides: { ind?: TechnicalIndicators; positions?: AlpacaPosition[]; learning?: string; macro?: string; news?: AlpacaNewsArticle[]
  watchlist?: string; threshold?: number; signal?: string | null; learn?: LearnContext; sector?: string; env?: PromptEnv } = {}): string {
  return buildEnrichedPrompt(
    'XYZ', overrides.ind ?? indicators(), ACCOUNT, overrides.positions ?? [], overrides.learning ?? 'LEARN-TEXT', overrides.macro ?? 'MACRO-TEXT',
    overrides.news ?? [], overrides.watchlist, overrides.threshold, overrides.signal === undefined ? 'MEAN_REVERSION' : overrides.signal,
    overrides.learn, overrides.sector ?? '', overrides.env ?? NO_ENV,
  )
}

function activeSetupSection(text: string): string {
  return text.slice(text.indexOf('--- ACTIVE SETUP TYPE ---'))
}

describe('rsiLabel', () => {
  it.each([
    [null, ''], [71, '(OVERBOUGHT — caution on new longs)'], [70, '(elevated momentum)'], [61, '(elevated momentum)'], [60, '(neutral)'],
    [40, '(neutral)'], [39, '(weak momentum, potential entry zone)'], [30, '(weak momentum, potential entry zone)'], [29.9, '(OVERSOLD — potential reversal opportunity)'],
  ])('rsi %s -> %s', (rsi, expected) => {
    expect(rsiLabel(rsi)).toBe(expected)
  })
})

describe('macdLabel', () => {
  it.each([
    [null, ''],
    [{ macdLine: 1, signalLine: 0.5, histogram: 0.5 }, '(BULLISH — momentum increasing)'],
    [{ macdLine: -1, signalLine: -0.5, histogram: -0.5 }, '(BEARISH — momentum decreasing)'],
    [{ macdLine: 0.2, signalLine: 0.5, histogram: 0.1 }, '(bullish histogram)'],
    [{ macdLine: 0.5, signalLine: 0.5, histogram: 0 }, '(bearish histogram)'],
    [{ macdLine: 1, signalLine: 0.5, histogram: -0.1 }, '(bearish histogram)'],
  ])('macd %j -> %s', (macd, expected) => {
    expect(macdLabel(macd)).toBe(expected)
  })
})

describe('bbLabel', () => {
  const band = (percentB: number) => ({ upper: 1, middle: 1, lower: 1, percentB })
  it.each([
    [null, ''], [1.01, '(ABOVE upper band — overbought territory)'], [1, '(near upper band)'], [0.81, '(near upper band)'], [0.8, '(mid-range)'],
    [0.5, '(mid-range)'], [0.2, '(mid-range)'], [0.19, '(near lower band — potential support)'], [0, '(near lower band — potential support)'],
    [-0.01, '(BELOW lower band — oversold territory)'],
  ])('percentB %s -> %s', (percentB, expected) => {
    expect(bbLabel(percentB === null ? null : band(percentB))).toBe(expected)
  })
})

describe('smaLabel', () => {
  it.each([
    [110, null, 50, 'N/A'], [110, 0, 50, 'N/A'],
    [110, 100, 50, '$100.00 (+10.0% — ABOVE SMA50)'],
    [90, 100, 200, '$100.00 (-10.0% — BELOW SMA200)'],
    [100, 100, 50, '$100.00 (0.0% — BELOW SMA50)'],
    [123.456, 120, 200, '$120.00 (+2.9% — ABOVE SMA200)'],
  ])('price %s sma %s period %s -> %s', (price, sma, period, expected) => {
    expect(smaLabel(price, sma, period)).toBe(expected)
  })
})

describe('kalmanLabel', () => {
  const k = (overrides: Partial<NonNullable<TechnicalIndicators['kalman']>> = {}) => ({
    stateEstimate: 130, forecastError: -6.544, errorStdDev: 2.5, zScore: -2.6176, signal: 'MEAN_REVERSION_LONG' as const, ...overrides,
  })

  it('returns the insufficient-data text when there is no Kalman state', () => {
    expect(kalmanLabel(null)).toBe('N/A — insufficient data')
  })

  it('formats a below-fair-value mean-reversion state with an annotation', () => {
    expect(kalmanLabel(k(), 'note')).toBe([
      'Fair Value Estimate: $130.00',
      'Forecast Error e(t): -6.5440 (price is BELOW fair value)',
      'Error Std Dev Q(t): 2.5000',
      'Z-Score: -2.618 (note)',
      'Signal: *** MEAN_REVERSION_LONG — price significantly below fair value, potential bounce ***',
    ].join('\n'))
  })

  it('formats an above-fair-value exit state without an annotation', () => {
    expect(kalmanLabel(k({ forecastError: 0.5, zScore: 0.25, signal: 'EXIT_LONG' }))).toBe([
      'Fair Value Estimate: $130.00',
      'Forecast Error e(t): +0.5000 (price is ABOVE fair value)',
      'Error Std Dev Q(t): 2.5000',
      'Z-Score: 0.250',
      'Signal: *** EXIT_LONG — price reverted to fair value, consider closing longs ***',
    ].join('\n'))
  })

  it('formats the neutral signal and treats a zero error as above fair value', () => {
    expect(kalmanLabel(k({ forecastError: 0, signal: 'NEUTRAL' }))).toContain('Forecast Error e(t): +0.0000 (price is ABOVE fair value)')
    expect(kalmanLabel(k({ signal: 'NEUTRAL' }))).toContain('Signal: NEUTRAL — no statistical edge detected')
  })
})

describe('SYSTEM_PROMPT', () => {
  it('equals the original text exactly', () => {
    expect(SYSTEM_PROMPT).toBe(legacy.SYSTEM_PROMPT)
  })

  it('keeps the analyst-only contract wording', () => {
    expect(SYSTEM_PROMPT.startsWith('You are a trading analyst. Your role is to:\n1. EXPLAIN what the indicators show')).toBe(true)
    expect(SYSTEM_PROMPT).toContain('- You do NOT decide whether to trade')
    expect(SYSTEM_PROMPT).toContain('Respond ONLY with valid JSON. No markdown, no text outside JSON.')
    expect(SYSTEM_PROMPT.endsWith('- This field is for logging/learning only — it does not block or approve the trade.')).toBe(true)
  })
})

describe('buildEnrichedPrompt exact output', () => {
  const VOLUME = (1234567).toLocaleString()
  const SMALL_VOLUME = (1000).toLocaleString()

  it('MEAN_REVERSION with full indicators, no news, no position, no optional sections', () => {
    const expected = [
      'ANALYSIS REQUEST: XYZ', '', '--- MACRO & MARKET CONTEXT (last 12h headlines) ---', 'MACRO-TEXT', '',
      '--- RECENT NEWS FOR XYZ (last 24h) ---', 'No recent news for this symbol in the last 24 hours.', '',
      '--- MARKET DATA ---', 'Current Price: $123.46', `Volume: ${VOLUME}`, '',
      '--- PRIMARY SIGNAL: KALMAN FILTER (E.P. Chan) ---', 'Fair Value Estimate: $130.00',
      'Forecast Error e(t): -6.5440 (price is BELOW fair value)', 'Error Std Dev Q(t): 2.5000',
      'Z-Score: -2.618 (entry threshold: < -1.3 | exit threshold: >= -0.8)',
      'Signal: *** MEAN_REVERSION_LONG — price significantly below fair value, potential bounce ***', '',
      '--- MARKET REGIME ---', 'ADX(14): 22.50 (TRANSITION — regime unclear)', 'ATR(14) Percentile: 75% ',
      'Regime: RANGING → Position size multiplier: 0.50x', '',
      '--- SECONDARY INDICATORS (context only — confirm Kalman signal, do not replace it) ---',
      'RSI(14): 28.40 (OVERSOLD — potential reversal opportunity)',
      'MACD: line=-0.5000, signal=-0.3000, histogram=-0.2000 (BEARISH — momentum decreasing)',
      'Bollinger Bands: upper=$130.00, middle=$125.00, lower=$120.00, %B=-0.100 (BELOW lower band — oversold territory)',
      'SMA50: $130.00 (-5.0% — BELOW SMA50)', 'SMA200: $120.00 (+2.9% — ABOVE SMA200)',
      'EMA50: $128.00 (price -3.50% from EMA50)', 'EMA200: $126.00 — EMA50 > EMA200 (uptrend)', '',
      '--- PORTFOLIO STATE ---', 'Total Equity: $100000.00', 'Available Cash: $50000.00', 'Buying Power: $200000.00',
      'Open Positions: 0/5', 'Max Position Value Allowed: $10000.00', '',
      '--- CURRENT POSITION IN XYZ ---', 'No position — eligible for BUY', '',
      '--- RISK PARAMETERS ---', 'Max Position Size: 10% of equity ($10000.00)', 'Stop Loss: 5% below entry', 'Max Simultaneous Positions: 5', '',
      '--- YOUR LEARNING HISTORY ---', 'LEARN-TEXT', '',
      '--- ACTIVE SETUP TYPE ---', 'The system detected a MEAN_REVERSION setup for this symbol.', '', 'Setup context:',
      'MEAN_REVERSION: Price is statistically below fair value.', 'Edge: Kalman z-score <= threshold → price expected to revert up.',
      'Key indicators to analyze: z-score magnitude, RSI oversold, %B near lower band, MACD momentum direction.', '',
      'Your analysis should focus on whether the conditions supporting this specific setup are strong or weak.', '',
      'Analyze XYZ and provide your trading decision as JSON.',
    ].join('\n')

    expect(prompt()).toBe(expected)
  })

  it('all optional sections with null indicators, an open position, sector context, watchlist, news-adjusted threshold and learn mode', () => {
    const expected = [
      'ANALYSIS REQUEST: XYZ', '', '--- MACRO & MARKET CONTEXT (last 12h headlines) ---', 'MACRO-TEXT', '',
      '--- SECTOR ROTATION (20-day relative strength vs SPY) ---', 'SECTOR-TEXT', '',
      '--- RECENT NEWS FOR XYZ (last 24h) ---', 'No recent news for this symbol in the last 24 hours.', '',
      '--- MARKET DATA ---', 'Current Price: $50.00', `Volume: ${SMALL_VOLUME}`, '',
      '--- PRIMARY SIGNAL: KALMAN FILTER (E.P. Chan) ---', 'N/A — insufficient data', '',
      '--- MARKET REGIME ---', 'ADX(14): N/A ', 'ATR(14) Percentile: N/A ', 'Regime: N/A → Position size multiplier: 1.00x', '',
      '--- SECONDARY INDICATORS (context only — confirm Kalman signal, do not replace it) ---', 'RSI(14): N/A ',
      'MACD: line=N/A, signal=N/A, histogram=N/A ', 'Bollinger Bands: upper=$N/A, middle=$N/A, lower=$N/A, %B=N/A ',
      'SMA50: N/A', 'SMA200: N/A', 'EMA50: N/A', 'EMA200: N/A', '',
      '--- PORTFOLIO STATE ---', 'Total Equity: $100000.00', 'Available Cash: $50000.00', 'Buying Power: $200000.00',
      'Open Positions: 1/5', 'Max Position Value Allowed: $10000.00', '',
      '--- CURRENT POSITION IN XYZ ---', 'Holding 12 shares @ avg $48.50, Unrealized P&L: $18.00 (3.09%)', '',
      '--- RISK PARAMETERS ---', 'Max Position Size: 10% of equity ($10000.00)', 'Stop Loss: 5% below entry', 'Max Simultaneous Positions: 5', '',
      '--- YOUR LEARNING HISTORY ---', 'L', '',
      '--- NEAR-MISS WATCHLIST CONTEXT ---', 'WATCH-TEXT', '',
      '--- NEWS-ADJUSTED THRESHOLD ---', 'Entry threshold for this cycle: -1.700 (base: -1.3, news adjustment: -0.400)', '',
      '--- ACTIVE SETUP TYPE ---', 'The system detected a MEAN_REVERSION setup for this symbol.', '', 'Setup context:',
      'MEAN_REVERSION: Price is statistically below fair value.', 'Edge: Kalman z-score <= threshold → price expected to revert up.',
      'Key indicators to analyze: z-score magnitude, RSI oversold, %B near lower band, MACD momentum direction.', '',
      'Your analysis should focus on whether the conditions supporting this specific setup are strong or weak.', '',
      'Analyze XYZ and provide your trading decision as JSON.', '',
      '=== LEARN MODE — PRE-FILTER FLAGS ===', 'These conditions were flagged but did NOT block execution.',
      'Evaluate the full setup and provide your decision regardless.', '', 'Flags: {', '  "a": 1,', '  "b": [', '    "x"', '  ]', '}', '',
      'Include these fields in your JSON response:', '- "learning_note": string — what this case teaches about the setup',
      '- "near_miss_score": number (1-10) — setup quality score', '- "what_would_trigger": string — what specific condition needs to change for a BUY',
      '- "self_flagged_disqualifying_risk": boolean — see SELF_FLAGGED_DISQUALIFYING_RISK criteria above',
      '=====================================',
    ].join('\n')

    const text = prompt({
      ind: nullIndicators(), positions: [POSITION], learning: 'L', macro: 'MACRO-TEXT', watchlist: 'WATCH-TEXT', threshold: -1.7,
      learn: { flags: { a: 1, b: ['x'] } } as unknown as LearnContext, sector: 'SECTOR-TEXT',
    })

    expect(text).toBe(expected)
  })

  it('formats symbol news with the headline and the en-US time of the article', () => {
    const article = { headline: 'Big move', created_at: '2026-11-04T15:30:00Z' } as AlpacaNewsArticle
    const time = new Date('2026-11-04T15:30:00Z').toLocaleTimeString('en-US')

    expect(prompt({ news: [article, { ...article, headline: 'Second' }] })).toContain(`--- RECENT NEWS FOR XYZ (last 24h) ---\n• Big move (${time})\n• Second (${time})\n\n--- MARKET DATA ---`)
  })

  it.each([
    ['no setup', null, ['--- ACTIVE SETUP TYPE ---', 'No specific setup was detected — analyze why.', '', 'Analyze XYZ and provide your trading decision as JSON.']],
    ['TREND_PULLBACK', 'TREND_PULLBACK', [
      '--- ACTIVE SETUP TYPE ---', 'The system detected a TREND_PULLBACK setup for this symbol.', '', 'Setup context:',
      'TREND_PULLBACK: Price pulled back in an established uptrend.',
      'Edge: EMA50 > EMA200 (trend intact), z-score <= 0 (near fair value), ADX >= 20 (trend has strength), EMA50 slope rising.',
      'Key indicators: trend structure, pullback depth, momentum recovery.', '',
      'Your analysis should focus on whether the conditions supporting this specific setup are strong or weak.', '',
      'Analyze XYZ and provide your trading decision as JSON.']],
    ['TREND_ZLE05', 'TREND_ZLE05', [
      '--- ACTIVE SETUP TYPE ---', 'The system detected a TREND_ZLE05 setup for this symbol.', '', 'Setup context:',
      'TREND_ZLE05: Trend continuation with price moderately above fair value.',
      'Edge: EMA50 > EMA200, 0 < z-score <= 1.25, MACD histogram > 0, ADX >= 18 (or >= 15 with strong MACD > 0.25), EMA50 slope rising.',
      'Key indicators: MACD momentum, trend strength, z-score proximity.',
      'Note: z 0.5–1.25 is the expanded bucket — valid continuation signal when ADX and MACD confirm trend quality.', '',
      'Your analysis should focus on whether the conditions supporting this specific setup are strong or weak.', '',
      'Analyze XYZ and provide your trading decision as JSON.']],
    ['EMA_RECLAIM', 'EMA_RECLAIM', [
      '--- ACTIVE SETUP TYPE ---', 'The system detected a EMA_RECLAIM setup for this symbol.', '', 'Setup context:',
      'EMA_RECLAIM: Trend reclaim setup — price was below EMA50 yesterday and crossed above it today, recovering a key trend level.',
      'This is NOT mean-reversion. This is trend resumption after a pullback.',
      'Edge: Confirmed EMA50 cross from below (prevClose <= ema50Prev, currentPrice > ema50), price below fair value (z < 0), EMA50 slope rising, minimum 0.2% distance above EMA50.',
      'Key indicators: cross confirmation, EMA50 slope direction, z-score proximity to fair value, momentum recovery.',
      'Note: best setups have EMA50 > EMA200 (structural uptrend intact).', '',
      'Your analysis should focus on whether the conditions supporting this specific setup are strong or weak.', '',
      'Analyze XYZ and provide your trading decision as JSON.']],
    ['TREND_PULLBACK_3DAY', 'TREND_PULLBACK_3DAY', [
      '--- ACTIVE SETUP TYPE ---', 'The system detected a TREND_PULLBACK_3DAY setup for this symbol.', '', 'Setup context:',
      'TREND_PULLBACK_3DAY: Price pulled back for 3 consecutive days within an established uptrend, entering on the 4th day.',
      'Edge: price > SMA200 (uptrend filter) AND the last 3 known daily closes each closed lower than the day before (a 3-day down-streak). This is a pure price-action setup — it does NOT use z-score, ADX, or MACD as entry conditions, unlike this system\'s other setups. A weak or negative Kalman z-score reading here is expected and is NOT a disqualifying signal for this specific setup — do not compare it against MEAN_REVERSION-style entry thresholds, which do not apply here.',
      'Key indicators: SMA200 trend filter, the depth/consistency of the 3-day pullback, and current price\'s relationship to SMA5 (the exit trigger — a close back above SMA5 signals the pullback has ended).',
      'Your analysis should focus on whether the broader uptrend and macro/sector context support this pullback resolving upward, not on statistical dislocation from fair value.', '',
      'Your analysis should focus on whether the conditions supporting this specific setup are strong or weak.', '',
      'Analyze XYZ and provide your trading decision as JSON.']],
  ])('active setup section: %s', (_name, signal, lines) => {
    expect(activeSetupSection(prompt({ signal }))).toBe(lines.join('\n'))
  })
})

describe('buildEnrichedPrompt reads the environment only from its argument', () => {
  const ENV_LINES = /Open Positions|Max Position|Stop Loss|Max Simultaneous/

  function envLines(text: string): string[] {
    return text.split('\n').filter((line) => ENV_LINES.test(line))
  }

  it('uses the argument values for max position size, max positions and stop loss', () => {
    const text = prompt({ env: { MAX_POSITION_SIZE: '0.25', MAX_POSITIONS: '8', STOP_LOSS_PCT: '0.07' } })

    expect(envLines(text)).toEqual([
      'Open Positions: 0/8', 'Max Position Value Allowed: $25000.00', 'Max Position Size: 25% of equity ($25000.00)',
      'Stop Loss: 7% below entry', 'Max Simultaneous Positions: 8',
    ])
  })

  it('falls back to the defaults when the argument has no values', () => {
    expect(envLines(prompt({ env: {} }))).toEqual([
      'Open Positions: 0/5', 'Max Position Value Allowed: $10000.00', 'Max Position Size: 10% of equity ($10000.00)',
      'Stop Loss: 5% below entry', 'Max Simultaneous Positions: 5',
    ])
  })

  it('ignores process.env', () => {
    process.env.MAX_POSITION_SIZE = '0.9'
    process.env.MAX_POSITIONS = '99'
    process.env.STOP_LOSS_PCT = '0.5'

    expect(prompt({ env: {} })).toBe(prompt({ env: {} }))
    expect(envLines(prompt({ env: {} }))).toContain('Max Simultaneous Positions: 5')
  })
})

describe('differential check against the frozen original code', () => {
  const INDICATORS: TechnicalIndicators[] = [
    indicators(), nullIndicators(),
    indicators({ adx: 35, atrPercentile: 0.9, marketRegime: 'TRENDING', rsi: 75, bollingerBands: { upper: 1, middle: 1, lower: 1, percentB: 1.2 } }),
    indicators({ adx: 10, atrPercentile: 0.1, marketRegime: 'HIGH_VOLATILITY', rsi: 55, macd: { macdLine: 1, signalLine: 0.5, histogram: 0.5 } }),
    indicators({ adx: 25, atrPercentile: 0.5, marketRegime: 'TRANSITION', ema50: 120, ema200: 126, sma50: null, kalman: { stateEstimate: 100, forecastError: 2, errorStdDev: 1, zScore: 1.1, signal: 'EXIT_LONG' } }),
    indicators({ distanceToEma50Pct: 4.2, rsi: 65, kalman: { stateEstimate: 100, forecastError: 0, errorStdDev: 1, zScore: 0, signal: 'NEUTRAL' } }),
  ]
  const SIGNALS: Array<string | null | undefined> = [null, undefined, 'MEAN_REVERSION', 'TREND_PULLBACK', 'TREND_ZLE05', 'EMA_RECLAIM', 'TREND_PULLBACK_3DAY', 'OTHER']
  const THRESHOLDS: Array<number | undefined> = [undefined, -1.3, -1.7]
  const ENVS: PromptEnv[] = [{}, { MAX_POSITION_SIZE: '0.25', MAX_POSITIONS: '8', STOP_LOSS_PCT: '0.07' }, { MAX_POSITION_SIZE: 'abc', MAX_POSITIONS: '', STOP_LOSS_PCT: '0' }]
  const NEWS = [{ headline: 'Headline', created_at: '2026-11-04T15:30:00Z' } as AlpacaNewsArticle]
  const LEARN = { flags: { gate: 'x' } } as unknown as LearnContext

  function setProcessEnv(env: PromptEnv): void {
    for (const key of ENV_KEYS) {
      const value = env[key]
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }

  it('returns identical prompts over a large input grid', () => {
    let checked = 0

    for (const ind of INDICATORS) for (const signal of SIGNALS) for (const threshold of THRESHOLDS) for (const env of ENVS)
      for (const watchlist of [undefined, 'W']) for (const learn of [undefined, LEARN]) for (const sector of ['', 'S'])
        for (const positions of [[], [POSITION]]) for (const news of [[], NEWS]) {
          setProcessEnv(env)
          const original = legacy.buildEnrichedPrompt('XYZ', ind, ACCOUNT, positions, 'L', 'M', news, watchlist, threshold, signal, learn, sector)

          const moved = buildEnrichedPrompt('XYZ', ind, ACCOUNT, positions, 'L', 'M', news, watchlist, threshold, signal, learn, sector, env)

          if (moved !== original) throw new Error(`mismatch: ${JSON.stringify({ signal, threshold, env, watchlist, learn: !!learn, sector, positions: positions.length, news: news.length })}`)
          checked++
        }

    expect(checked).toBe(INDICATORS.length * SIGNALS.length * THRESHOLDS.length * ENVS.length * 2 * 2 * 2 * 2 * 2)
  })

  it('returns identical labels for every branch input', () => {
    for (const rsi of [null, 10, 29.99, 30, 39.99, 40, 60, 60.01, 70, 70.01, 95]) expect(rsiLabel(rsi)).toBe(legacy.rsiLabel(rsi))
    for (const pct of [-1, -0.001, 0, 0.19, 0.2, 0.8, 0.81, 1, 1.5]) {
      const bb = { upper: 1, middle: 1, lower: 1, percentB: pct }
      expect(bbLabel(bb)).toBe(legacy.bbLabel(bb))
    }
    for (const [price, sma] of [[110, 100], [90, 100], [100, 100], [5, 0], [5, null]] as Array<[number, number | null]>) {
      expect(smaLabel(price, sma, 50)).toBe(legacy.smaLabel(price, sma, 50))
    }
    for (const histogram of [-1, 0, 1]) for (const line of [-1, 0, 1]) {
      const macd = { macdLine: line, signalLine: 0, histogram }
      expect(macdLabel(macd)).toBe(legacy.macdLabel(macd))
    }
  })
})
