// Frozen verbatim copy of the prompt-building code as it stood in claude-agent.ts before the prompt-builder extraction.
// Only `export` was added. Do not edit: it is the reference for the differential test in prompt-builder.test.ts.
import type { AlpacaAccount, AlpacaPosition, LearnContext, TechnicalIndicators } from '../../types'
import type { AlpacaNewsArticle } from '../../alpaca'
import { ZSCORE_ENTRY_THRESHOLD } from '../../config'
import { regimeMultiplier } from '../../position-sizing'

// ============================================================
// SYSTEM PROMPT (static — defines Claude's role)
// ============================================================

export const SYSTEM_PROMPT = `You are a trading analyst. Your role is to:
1. EXPLAIN what the indicators show
2. IDENTIFY the market context
3. ADD learning notes for future reference

IMPORTANT:
- You do NOT decide whether to trade
- You do NOT validate or invalidate setups
- You do NOT apply rules or filters
- The system has ALREADY determined if a setup exists

Your analysis is for logging and learning only.

IMPORTANT — Do NOT:
- say BUY, SELL, or HOLD
- reference the 9/10 rule
- reference confidence thresholds by regime
- use language like "prohibits trading"
- use language like "blocks entry"
- use RSI or %B as entry conditions
- reject or approve trades

Respond ONLY with valid JSON. No markdown, no text outside JSON.

RESPONSE SCHEMA (strict JSON):
{
  "reasoning": "2-4 sentences: what the indicators show and what the market context is",
  "confidence": 0.0,
  "learning_note": "what this case teaches about the setup",
  "near_miss_score": 0,
  "what_would_trigger": "what specific condition would strengthen the signal",
  "self_flagged_disqualifying_risk": false
}

SELF_FLAGGED_DISQUALIFYING_RISK — how to set this field:
- Set to TRUE only when your reasoning explicitly names either (i) a specific prior loss for this symbol or an analogous setup, with a percentage, or (ii) an aggregate negative historical outcome statistic for the same setup shape — describe the specific number or outcome exactly as it appears in the provided context, without inventing or rounding to a more precise-sounding figure than what was actually given.
- Set to FALSE when your reasoning does not explicitly identify one of these two disqualifying patterns. Do not infer this from general caution, market uncertainty, or elevated-risk language alone (e.g. high ATR, negative MACD) unless tied to a specific named historical loss or negative statistic as described above.
- Do NOT set true merely because your reasoning cites historical evidence in general — a trade that cites a POSITIVE precedent (a past win for this setup/symbol) is not a disqualifying-risk case, even if it also mentions a loss elsewhere for contrast; only set true if the negative/disqualifying pattern is what your reasoning is actually weighing as a reason for concern.
- Lessons in the learning block come from single past trades of the same setup. They are hypotheses that may be wrong, not rules, and they never approve or block the trade; weigh them against the indicators provided and do not treat one lesson as evidence about a group of trades.
- Do not infer population-level conclusions from a single historical trade. Describe only the evidence actually present in the provided context.
- Determine this value after you have formed your reasoning and conclusion — it should reflect what your finished analysis actually relied on, not a prediction made before reasoning it through.
- This field is for logging/learning only — it does not block or approve the trade.`


// ============================================================
// INDICATOR INTERPRETATION HELPERS
// ============================================================

export function rsiLabel(rsi: number | null): string {
  if (rsi === null) return ''
  if (rsi > 70) return '(OVERBOUGHT — caution on new longs)'
  if (rsi < 30) return '(OVERSOLD — potential reversal opportunity)'
  if (rsi > 60) return '(elevated momentum)'
  if (rsi < 40) return '(weak momentum, potential entry zone)'
  return '(neutral)'
}

export function macdLabel(macd: TechnicalIndicators['macd']): string {
  if (!macd) return ''
  if (macd.histogram > 0 && macd.macdLine > macd.signalLine) return '(BULLISH — momentum increasing)'
  if (macd.histogram < 0 && macd.macdLine < macd.signalLine) return '(BEARISH — momentum decreasing)'
  if (macd.histogram > 0) return '(bullish histogram)'
  return '(bearish histogram)'
}

export function bbLabel(bb: TechnicalIndicators['bollingerBands']): string {
  if (!bb) return ''
  if (bb.percentB > 1) return '(ABOVE upper band — overbought territory)'
  if (bb.percentB < 0) return '(BELOW lower band — oversold territory)'
  if (bb.percentB > 0.8) return '(near upper band)'
  if (bb.percentB < 0.2) return '(near lower band — potential support)'
  return '(mid-range)'
}

export function smaLabel(price: number, sma: number | null, period: number): string {
  if (!sma) return 'N/A'
  const pct = ((price - sma) / sma * 100).toFixed(1)
  return `$${sma.toFixed(2)} (${price > sma ? '+' : ''}${pct}% — ${price > sma ? 'ABOVE' : 'BELOW'} SMA${period})`
}

export function kalmanLabel(kalman: TechnicalIndicators['kalman'], zscoreAnnotation?: string): string {
  if (!kalman) return 'N/A — insufficient data'
  const dir = kalman.forecastError >= 0 ? 'ABOVE' : 'BELOW'
  const signalMap = {
    MEAN_REVERSION_LONG: '*** MEAN_REVERSION_LONG — price significantly below fair value, potential bounce ***',
    EXIT_LONG: '*** EXIT_LONG — price reverted to fair value, consider closing longs ***',
    NEUTRAL: 'NEUTRAL — no statistical edge detected',
  }
  return [
    `Fair Value Estimate: $${kalman.stateEstimate.toFixed(2)}`,
    `Forecast Error e(t): ${kalman.forecastError >= 0 ? '+' : ''}${kalman.forecastError.toFixed(4)} (price is ${dir} fair value)`,
    `Error Std Dev Q(t): ${kalman.errorStdDev.toFixed(4)}`,
    `Z-Score: ${kalman.zScore.toFixed(3)}${zscoreAnnotation ? ` (${zscoreAnnotation})` : ''}`,
    `Signal: ${signalMap[kalman.signal]}`,
  ].join('\n')
}


// ============================================================
// BUILD ENRICHED PROMPT PER SYMBOL
// ============================================================

export function buildEnrichedPrompt(
  symbol: string,
  indicators: TechnicalIndicators,
  account: AlpacaAccount,
  positions: AlpacaPosition[],
  learningContext: string,
  macroContext: string,
  symbolNews: AlpacaNewsArticle[],
  watchlistContext?: string,
  effectiveThreshold?: number,
  signalType?: string | null,
  learnContext?: LearnContext,
  sectorRotationContext: string = '',
): string {
  const equity = parseFloat(account.equity)
  const maxPositionValue = equity * parseFloat(process.env.MAX_POSITION_SIZE ?? '0.10')
  const currentPosition = positions.find((p) => p.symbol === symbol)

  const symbolNewsSection = symbolNews.length > 0
    ? symbolNews.map((n) => `• ${n.headline} (${new Date(n.created_at).toLocaleTimeString('en-US')})`).join('\n')
    : 'No recent news for this symbol in the last 24 hours.'

  return `ANALYSIS REQUEST: ${symbol}

--- MACRO & MARKET CONTEXT (last 12h headlines) ---
${macroContext}
${sectorRotationContext ? `
--- SECTOR ROTATION (20-day relative strength vs SPY) ---
${sectorRotationContext}
` : ''}
--- RECENT NEWS FOR ${symbol} (last 24h) ---
${symbolNewsSection}

--- MARKET DATA ---
Current Price: $${indicators.currentPrice.toFixed(2)}
Volume: ${indicators.volume.toLocaleString()}

--- PRIMARY SIGNAL: KALMAN FILTER (E.P. Chan) ---
${kalmanLabel(indicators.kalman, signalType === 'MEAN_REVERSION' ? `entry threshold: < ${ZSCORE_ENTRY_THRESHOLD} | exit threshold: >= -0.8` : undefined)}

--- MARKET REGIME ---
ADX(14): ${indicators.adx?.toFixed(2) ?? 'N/A'} ${indicators.adx !== null ? (indicators.adx > 30 ? '(TRENDING — strong directional move)' : indicators.adx >= 20 ? '(TRANSITION — regime unclear)' : '(RANGING — weak trend)') : ''}
ATR(14) Percentile: ${indicators.atrPercentile !== null ? (indicators.atrPercentile * 100).toFixed(0) + '%' : 'N/A'} ${indicators.atrPercentile !== null && indicators.atrPercentile > 0.80 ? '(HIGH VOLATILITY — elevated risk)' : ''}
Regime: ${indicators.marketRegime ?? 'N/A'} → Position size multiplier: ${regimeMultiplier(indicators.marketRegime ?? null).toFixed(2)}x

--- SECONDARY INDICATORS (context only — confirm Kalman signal, do not replace it) ---
RSI(14): ${indicators.rsi?.toFixed(2) ?? 'N/A'} ${rsiLabel(indicators.rsi)}
MACD: line=${indicators.macd?.macdLine.toFixed(4) ?? 'N/A'}, signal=${indicators.macd?.signalLine.toFixed(4) ?? 'N/A'}, histogram=${indicators.macd?.histogram.toFixed(4) ?? 'N/A'} ${macdLabel(indicators.macd)}
Bollinger Bands: upper=$${indicators.bollingerBands?.upper.toFixed(2) ?? 'N/A'}, middle=$${indicators.bollingerBands?.middle.toFixed(2) ?? 'N/A'}, lower=$${indicators.bollingerBands?.lower.toFixed(2) ?? 'N/A'}, %B=${indicators.bollingerBands?.percentB.toFixed(3) ?? 'N/A'} ${bbLabel(indicators.bollingerBands)}
SMA50: ${smaLabel(indicators.currentPrice, indicators.sma50, 50)}
SMA200: ${smaLabel(indicators.currentPrice, indicators.sma200, 200)}
EMA50: ${indicators.ema50 !== null ? `$${indicators.ema50.toFixed(2)} (price ${indicators.distanceToEma50Pct !== null ? (indicators.distanceToEma50Pct >= 0 ? '+' : '') + indicators.distanceToEma50Pct.toFixed(2) + '% from EMA50' : 'N/A'})` : 'N/A'}
EMA200: ${indicators.ema200 !== null ? `$${indicators.ema200.toFixed(2)}${indicators.ema50 !== null && indicators.ema200 !== null ? (indicators.ema50 > indicators.ema200 ? ' — EMA50 > EMA200 (uptrend)' : ' — EMA50 < EMA200 (downtrend)') : ''}` : 'N/A'}

--- PORTFOLIO STATE ---
Total Equity: $${equity.toFixed(2)}
Available Cash: $${parseFloat(account.cash).toFixed(2)}
Buying Power: $${parseFloat(account.buying_power).toFixed(2)}
Open Positions: ${positions.length}/${process.env.MAX_POSITIONS ?? '5'}
Max Position Value Allowed: $${maxPositionValue.toFixed(2)}

--- CURRENT POSITION IN ${symbol} ---
${
  currentPosition
    ? `Holding ${currentPosition.qty} shares @ avg $${parseFloat(currentPosition.avg_entry_price).toFixed(2)}, Unrealized P&L: $${parseFloat(currentPosition.unrealized_pl).toFixed(2)} (${(parseFloat(currentPosition.unrealized_plpc) * 100).toFixed(2)}%)`
    : 'No position — eligible for BUY'
}

--- RISK PARAMETERS ---
Max Position Size: ${((parseFloat(process.env.MAX_POSITION_SIZE ?? '0.10')) * 100).toFixed(0)}% of equity ($${maxPositionValue.toFixed(2)})
Stop Loss: ${((parseFloat(process.env.STOP_LOSS_PCT ?? '0.05')) * 100).toFixed(0)}% below entry
Max Simultaneous Positions: ${process.env.MAX_POSITIONS ?? '5'}

--- YOUR LEARNING HISTORY ---
${learningContext}
${watchlistContext ? `
--- NEAR-MISS WATCHLIST CONTEXT ---
${watchlistContext}
` : ''}${signalType === 'MEAN_REVERSION' && effectiveThreshold !== undefined && effectiveThreshold !== ZSCORE_ENTRY_THRESHOLD ? `
--- NEWS-ADJUSTED THRESHOLD ---
Entry threshold for this cycle: ${effectiveThreshold.toFixed(3)} (base: ${ZSCORE_ENTRY_THRESHOLD}, news adjustment: ${(effectiveThreshold - ZSCORE_ENTRY_THRESHOLD).toFixed(3)})
` : ''}
--- ACTIVE SETUP TYPE ---
${signalType ? `The system detected a ${signalType} setup for this symbol.

Setup context:
${signalType === 'MEAN_REVERSION' ? `MEAN_REVERSION: Price is statistically below fair value.
Edge: Kalman z-score <= threshold → price expected to revert up.
Key indicators to analyze: z-score magnitude, RSI oversold, %B near lower band, MACD momentum direction.` : ''}${signalType === 'TREND_PULLBACK' ? `TREND_PULLBACK: Price pulled back in an established uptrend.
Edge: EMA50 > EMA200 (trend intact), z-score <= 0 (near fair value), ADX >= 20 (trend has strength), EMA50 slope rising.
Key indicators: trend structure, pullback depth, momentum recovery.` : ''}${signalType === 'TREND_ZLE05' ? `TREND_ZLE05: Trend continuation with price moderately above fair value.
Edge: EMA50 > EMA200, 0 < z-score <= 1.25, MACD histogram > 0, ADX >= 18 (or >= 15 with strong MACD > 0.25), EMA50 slope rising.
Key indicators: MACD momentum, trend strength, z-score proximity.
Note: z 0.5–1.25 is the expanded bucket — valid continuation signal when ADX and MACD confirm trend quality.` : ''}${signalType === 'EMA_RECLAIM' ? `EMA_RECLAIM: Trend reclaim setup — price was below EMA50 yesterday and crossed above it today, recovering a key trend level.
This is NOT mean-reversion. This is trend resumption after a pullback.
Edge: Confirmed EMA50 cross from below (prevClose <= ema50Prev, currentPrice > ema50), price below fair value (z < 0), EMA50 slope rising, minimum 0.2% distance above EMA50.
Key indicators: cross confirmation, EMA50 slope direction, z-score proximity to fair value, momentum recovery.
Note: best setups have EMA50 > EMA200 (structural uptrend intact).` : ''}${signalType === 'TREND_PULLBACK_3DAY' ? `TREND_PULLBACK_3DAY: Price pulled back for 3 consecutive days within an established uptrend, entering on the 4th day.
Edge: price > SMA200 (uptrend filter) AND the last 3 known daily closes each closed lower than the day before (a 3-day down-streak). This is a pure price-action setup — it does NOT use z-score, ADX, or MACD as entry conditions, unlike this system's other setups. A weak or negative Kalman z-score reading here is expected and is NOT a disqualifying signal for this specific setup — do not compare it against MEAN_REVERSION-style entry thresholds, which do not apply here.
Key indicators: SMA200 trend filter, the depth/consistency of the 3-day pullback, and current price's relationship to SMA5 (the exit trigger — a close back above SMA5 signals the pullback has ended).
Your analysis should focus on whether the broader uptrend and macro/sector context support this pullback resolving upward, not on statistical dislocation from fair value.` : ''}

Your analysis should focus on whether the conditions supporting this specific setup are strong or weak.` : 'No specific setup was detected — analyze why.'}

Analyze ${symbol} and provide your trading decision as JSON.${learnContext ? `

=== LEARN MODE — PRE-FILTER FLAGS ===
These conditions were flagged but did NOT block execution.
Evaluate the full setup and provide your decision regardless.

Flags: ${JSON.stringify(learnContext.flags, null, 2)}

Include these fields in your JSON response:
- "learning_note": string — what this case teaches about the setup
- "near_miss_score": number (1-10) — setup quality score
- "what_would_trigger": string — what specific condition needs to change for a BUY
- "self_flagged_disqualifying_risk": boolean — see SELF_FLAGGED_DISQUALIFYING_RISK criteria above
=====================================` : ''}`
}

