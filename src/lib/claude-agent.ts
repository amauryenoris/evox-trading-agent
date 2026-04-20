import Anthropic from '@anthropic-ai/sdk'
import { randomUUID } from 'crypto'
import {
  getAccount,
  getPositions,
  getClock,
  getBars,
  submitOrder,
  submitStopOrder,
  closePosition,
  getLatestSellOrder,
  getMarketMovers,
  getMacroNews,
  getNewsForSymbols,
  type AlpacaNewsArticle,
} from './alpaca'
import { calculateAllIndicators } from './indicators'
import { appendAgentLogEntries } from './agent-log'
import {
  detectClosedPositions,
  evaluateClosedTrade,
  removeOpenPositionContext,
  saveOpenPositionContext,
  buildLearningContext,
} from './learning'
import { getAllOpenPositionContexts, getTodayBuyExecutions } from './db'
import { isNewPositionAllowed } from './risk-manager'
import { selectStocksForAnalysis, recordSelectionOutcome } from './stock-selector'
import { newsIntelligenceLayer } from './news-intelligence'
import {
  detectNearMisses,
  updateWatchlist,
  checkAutoEntry,
  markWatchlistTriggered,
} from './watchlist-monitor'
import { getActiveNearMissForSymbol } from './db'
import type {
  AgentDecision,
  AgentLogEntry,
  AlpacaAccount,
  AlpacaPosition,
  TechnicalIndicators,
  TradeEvaluation,
  ThresholdMap,
  LearnContext,
  PreFilterFlag,
} from './types'

// ============================================================
// SYSTEM PROMPT (static — defines Claude's role)
// ============================================================

const SYSTEM_PROMPT = `You are a quantitative trader AI operating a paper trading simulation for US stocks.
Your methodology is based on the Market Wizards framework (Kovner, Seykota, E.P. Chan).

## CORE FRAMEWORK

### Primary Signal: Kalman Filter (E.P. Chan)
The Kalman filter is your PRIMARY indicator for mean reversion entries and exits.
- MEAN_REVERSION_LONG signal (zScore < -1.3): price is significantly below its estimated fair value — potential bounce
- EXIT_LONG signal (zScore >= -0.5): price has reverted to fair value — time to exit
- NEUTRAL: no statistical edge detected from the filter alone

### Secondary Context: RSI, MACD, Bollinger Bands, SMA
These are secondary — use them as a "market thermometer" (Kovner) to confirm price action, NOT as primary entry signals.
RSI/MACD/BB alone are insufficient justification for BUY or SELL. They must confirm the Kalman signal or a clear trend breakout.

### Entry Criteria — 9/10 Rule (Kovner)
Only commit capital when at least 9 of 10 conditions align:
- Kalman signal confirms mean reversion OR clear technical breakout above consolidation / new highs
- Volume supports the move (not a low-liquidity drift)
- RSI not in overbought territory for longs (RSI < 70)
- Price not in a "falling knife" pattern (downtrend with no consolidation)
- No contradicting macro or learning history signal
- Position count does not exceed maximum (5)
- Sufficient buying power available
- Confidence from learning history >= 0.50
- Pattern library shows positive win rate for similar conditions (if data available)
- Risk/reward ratio is favorable (potential gain > potential loss)
If fewer than 9 conditions align, return HOLD regardless of individual signal strength.

### Exit Criteria
- Kalman EXIT_LONG signal (zScore reverted to -0.5 or above)
- Technical stop invalidated (pattern that justified entry no longer holds)
- Pre-defined stop loss hit (5% below entry)
Exit is pre-defined and non-negotiable — do not move stops hoping for recovery.

### Risk Management (Kovner 1-2% Rule)
- Maximum capital at risk per trade: 1% of total equity
- Undertrade mandate: if pattern uncertainty or learning history is mixed, use HALF the calculated position size
- Express undertrade recommendation in your reasoning field when applicable
- Never recommend a size larger than available buying power allows
- Position size is adjusted by market regime multiplier BEFORE the Kovner formula is applied: TRENDING=1.0, TRANSITION=0.75, RANGING=0.5, HIGH_VOLATILITY=0.25

### Position Sizing Note
Quantity will be calculated externally using the Kovner formula:
  capital_at_risk = equity × 0.01
  risk_per_share = entry_price × stop_loss_pct
  quantity = capital_at_risk / risk_per_share
Return quantity = 0 in your JSON — the system will calculate the correct size.

### Trading Psychology Rules (Seykota / Kovner)
- Losses are operational costs, not failures — cut them fast
- "Let winners run" — do not exit profitable positions at first sign of weakness unless Kalman says EXIT
- If a pattern has caused losses historically, reduce confidence accordingly
- The market is a thermometer, not a crystal ball — trade probabilities, not predictions

## REGIME RESTRICTIONS (mandatory — override 9/10 rule if violated)
- Mean reversion trades (Kalman z-score based) are ONLY valid when market_regime == RANGING.
  If regime is TRANSITION: return HOLD. Price is moving, not oscillating — mean reversion fails.
- If regime is HIGH_VOLATILITY: return HOLD unless confidence >= 0.70.
- If regime is TRENDING: only consider trend-following setups (breakout or EMA50 pullback), not mean reversion.
- Set signal_type to MEAN_REVERSION if using Kalman z-score, TREND_FOLLOWING if using breakout, PULLBACK_EMA50 if price is pulling back to EMA50 in an uptrend, OTHER otherwise.
- Set regime_compatible: false if the above rules block your entry, and return HOLD.

## STRICT OUTPUT RULES
- Respond ONLY with valid JSON matching the schema below. No markdown, no text outside JSON.
- Never recommend BUY if: maximum positions (5) are already open, or insufficient buying power.
- Never recommend SELL if: no position currently exists in that symbol.
- Only recommend BUY or SELL if confidence meets the regime threshold (RANGING: 0.50, TRENDING: 0.55, TRANSITION: 0.65, HIGH_VOLATILITY: 0.70). Otherwise return HOLD.
- Reasoning must explicitly reference the Kalman signal and at least one secondary indicator.
- Consider learning history seriously — past losses in similar conditions must lower confidence.
- Consider macro and symbol-specific news: if recent headlines contradict your technical thesis (e.g., bearish earnings, geopolitical shock affecting the sector), reduce confidence or return HOLD. News context is provided in the prompt under MACRO & MARKET CONTEXT and RECENT NEWS FOR [SYMBOL].

RESPONSE SCHEMA (strict JSON):
{
  "action": "BUY" | "SELL" | "HOLD",
  "symbol": "string",
  "quantity": 0,
  "reasoning": "3-5 sentences: cite Kalman signal, secondary indicators, 9/10 rule assessment, and learning history",
  "confidence": 0.0,
  "signal_type": "MEAN_REVERSION | TREND_FOLLOWING | PULLBACK_EMA50 | OTHER",
  "regime_compatible": true
}`

// ============================================================
// CONFIDENCE THRESHOLDS BY REGIME (Gate 0 + Pre-filter)
// ============================================================

const CONFIDENCE_THRESHOLDS: Record<string, number> = {
  RANGING: 0.50,        // was 0.65
  TRENDING: 0.55,       // was 0.70
  TRANSITION: 0.65,     // was 0.78
  HIGH_VOLATILITY: 0.70, // was 0.82
}

// ============================================================
// EXIT RULES — deterministic exits run before Claude analysis
// ============================================================

function getTradingDaysOpen(buyTimestamp: string): number {
  const msPerDay = 1000 * 60 * 60 * 24
  const elapsed = Date.now() - new Date(buyTimestamp).getTime()
  const calendarDays = elapsed / msPerDay
  // Approximate: 5/7 of calendar days are trading days
  return Math.floor(calendarDays * (5 / 7))
}

async function enforceExitRules(
  positions: AlpacaPosition[],
  indicatorsCache: Map<string, TechnicalIndicators>,
  openContexts: { symbol: string; buyTimestamp: string }[],
): Promise<AgentLogEntry[]> {
  const exitEntries: AgentLogEntry[] = []
  const timestamp = new Date().toISOString()

  for (const position of positions) {
    const ind = indicatorsCache.get(position.symbol)
    if (!ind?.kalman) continue

    const zScore = ind.kalman.zScore
    const pnlPct = parseFloat(position.unrealized_plpc)
    const ctx = openContexts.find((c) => c.symbol === position.symbol)
    const daysOpen = ctx ? getTradingDaysOpen(ctx.buyTimestamp) : 0

    let exitReason: string | null = null

    if (zScore >= -0.5) {
      exitReason = `Exit rule: z-score ${zScore.toFixed(3)} >= -0.5 — price reverted to fair value`
    } else if (pnlPct >= 0.10) {
      exitReason = `Exit rule: profit target reached (${(pnlPct * 100).toFixed(1)}% >= 10%)`
    } else if (daysOpen >= 20) {
      exitReason = `Exit rule: 20-day time stop (${daysOpen} trading days open)`
    } else if (
      ind.marketRegime === 'TRENDING' &&
      ind.ema50 !== null &&
      ind.currentPrice < ind.ema50 * 0.99
    ) {
      exitReason = `Exit rule: EMA50 stop — price $${ind.currentPrice.toFixed(2)} broke below EMA50 $${ind.ema50.toFixed(2)} by >1% (PULLBACK_EMA50 invalidated)`
    } else if (ind.marketRegime === 'TRENDING' && pnlPct >= 0.05) {
      exitReason = `Exit rule: trend profit target reached (${(pnlPct * 100).toFixed(1)}% >= 5%) in TRENDING regime`
    }

    if (!exitReason) continue

    console.log(`[EXIT-RULES] Closing ${position.symbol}: ${exitReason}`)
    try {
      await closePosition(position.symbol)
      exitEntries.push({
        id: randomUUID(),
        timestamp,
        symbol: position.symbol,
        decision: { action: 'SELL', symbol: position.symbol, quantity: 0, reasoning: exitReason, confidence: 1.0 },
        indicators: ind,
        portfolioSnapshot: { equity: position.market_value, cash: '0', positionCount: positions.length },
        orderExecuted: true,
        error: undefined,
      })
    } catch (err) {
      console.error(`[EXIT-RULES] Failed to close ${position.symbol}:`, err)
    }
  }

  return exitEntries
}

// ============================================================
// PRE-CLAUDE FILTER — runs before enriched prompt (Fix #1)
// ============================================================

function preClaudeFilter(
  symbol: string,
  indicators: TechnicalIndicators,
  positions: AlpacaPosition[],
  thresholdMap: ThresholdMap,
  portfolioEquity?: number,
  portfolioDrawdownPct?: number,
): { blocked: false; learnContext: LearnContext | null } {
  const { kalman, marketRegime } = indicators
  const threshold = thresholdMap[symbol] ?? -1.3
  const flags: PreFilterFlag[] = []

  // Check if ANY signal is present before flagging
  const hasMeanReversionSignal = kalman && kalman.zScore <= threshold && marketRegime === 'RANGING'
  const hasTrendFollowingSignal = (
    marketRegime === 'TRENDING' &&
    (indicators.adx ?? 0) > 25 &&
    indicators.macd !== null && indicators.macd.histogram > 0 && indicators.macd.macdLine > indicators.macd.signalLine &&
    indicators.currentPrice > (indicators.sma50 ?? 0) &&
    (indicators.rsi ?? 0) > 50 && (indicators.rsi ?? 0) < 75
  )
  // EMA50 Pullback: price pulling back to EMA50 in a confirmed uptrend
  const hasPullbackEMA50Signal = (
    marketRegime === 'TRENDING' &&
    indicators.ema50 !== null && indicators.ema200 !== null &&
    indicators.currentPrice > indicators.ema50 &&
    indicators.ema50 > indicators.ema200 &&
    Math.abs(indicators.distanceToEma50Pct ?? 100) <= 2.0 &&
    (indicators.rsi ?? 100) < 70
  )

  // Rule 1: flag only if NO signal is active
  if (!hasMeanReversionSignal && !hasTrendFollowingSignal && !hasPullbackEMA50Signal) {
    const zscore = kalman?.zScore ?? 0
    flags.push({
      rule: 'zscore',
      detail: `no signal: z-score ${zscore.toFixed(3)} (MR threshold: ${threshold.toFixed(3)}), trend: ${hasTrendFollowingSignal ? 'yes' : 'no'}`,
      gap: kalman ? parseFloat(Math.abs(zscore - threshold).toFixed(3)) : 0,
    })
  }

  // Rule 2: mean reversion only valid in RANGING — only flag if MR signal but wrong regime, and no trending signal
  if (!hasTrendFollowingSignal && !hasPullbackEMA50Signal && marketRegime !== 'RANGING' && kalman && kalman.zScore <= threshold) {
    flags.push({
      rule: 'regime',
      detail: `mean reversion in ${marketRegime ?? 'null'} — not ideal, no trend following signal either`,
      gap: 0,
    })
  }

  // Rule 3: portfolio drawdown > 10%
  if (portfolioDrawdownPct !== undefined && portfolioDrawdownPct < -0.10) {
    flags.push({
      rule: 'drawdown',
      detail: `drawdown ${(portfolioDrawdownPct * 100).toFixed(1)}%`,
      gap: 0,
    })
  }

  // Rule 4: HIGH_VOLATILITY with too many open positions
  if (marketRegime === 'HIGH_VOLATILITY' && positions.length >= 3) {
    flags.push({
      rule: 'volatility',
      detail: 'HIGH_VOLATILITY + positions >= 3',
      gap: 0,
    })
  }

  // LEARN mode: always proceed to Claude — never block
  if (flags.length > 0) {
    const nearest_flag = flags.reduce((prev, curr) =>
      curr.gap > 0 && (prev.gap === 0 || curr.gap < prev.gap) ? curr : prev
    , flags[0])
    return {
      blocked: false,
      learnContext: {
        pre_filter_triggered: true,
        flags,
        nearest_flag,
        mode: 'LEARN',
      },
    }
  }

  return { blocked: false, learnContext: null }
}

// ============================================================
// SIGNAL TYPE DETECTOR — mean reversion vs trend following
// ============================================================

interface SignalResult {
  type: 'MEAN_REVERSION' | 'TREND_FOLLOWING' | 'NO_SIGNAL'
  confidence: number
}

function generateSignalType(indicators: TechnicalIndicators): SignalResult {
  const { kalman, adx, macd, sma50, rsi, currentPrice, marketRegime, bollingerBands } = indicators

  // Mean Reversion: price significantly below fair value in a ranging market
  if (
    marketRegime === 'RANGING' &&
    kalman && kalman.zScore < -1.5 &&
    (rsi ?? 50) < 45 &&
    bollingerBands && bollingerBands.percentB < 0.2
  ) {
    return {
      type: 'MEAN_REVERSION',
      confidence: Math.min(Math.abs(kalman.zScore) / 3, 1.0),
    }
  }

  // Trend Following: strong directional momentum confirmed across indicators
  if (
    marketRegime === 'TRENDING' &&
    (adx ?? 0) > 25 &&
    macd !== null && macd.histogram > 0 && macd.macdLine > macd.signalLine &&
    currentPrice > (sma50 ?? 0) &&
    (rsi ?? 0) > 50 && (rsi ?? 0) < 75
  ) {
    return {
      type: 'TREND_FOLLOWING',
      confidence: Math.min((adx ?? 25) / 50, 1.0),
    }
  }

  return { type: 'NO_SIGNAL', confidence: 0 }
}

// ============================================================
// POSITION ROTATION — swap weakest position for better setup
// ============================================================

interface RotationDecision {
  rotate: boolean
  exitSymbol?: string
  reason: string
}

async function evaluateRotation(
  newSignal: SignalResult,
  openPositions: AlpacaPosition[],
  indicatorsCache: Map<string, TechnicalIndicators>,
): Promise<RotationDecision> {
  // Only evaluate if signal is strong enough
  if (newSignal.confidence < 0.70) {
    return { rotate: false, reason: 'Signal too weak for rotation' }
  }

  const exitCandidates: { symbol: string; reason: string; priority: number }[] = []

  for (const pos of openPositions) {
    const ind = indicatorsCache.get(pos.symbol)
    if (!ind?.kalman) continue

    const zScore = ind.kalman.zScore
    const pnlPct = parseFloat(pos.unrealized_plpc)

    // Priority 1: position already completed its mean reversion objective
    if (zScore >= -0.5) {
      exitCandidates.push({ symbol: pos.symbol, reason: `z-score ${zScore.toFixed(3)} reverted to fair value`, priority: 1 })
    }
    // Priority 2: position profitable and new setup has very high confidence
    else if (pnlPct > 0.05 && newSignal.confidence > 0.80) {
      exitCandidates.push({ symbol: pos.symbol, reason: `Rotating to better setup (P&L +${(pnlPct * 100).toFixed(1)}%, new confidence ${newSignal.confidence.toFixed(2)})`, priority: 2 })
    }
  }

  if (exitCandidates.length === 0) {
    return { rotate: false, reason: 'No rotation candidates — all positions still in progress' }
  }

  const toExit = exitCandidates.sort((a, b) => a.priority - b.priority)[0]
  return { rotate: true, exitSymbol: toExit.symbol, reason: toExit.reason }
}

// ============================================================
// GATE 0 — Regime-adjusted confidence threshold (Fix #3)
// ============================================================

function passesConfidenceGate(
  confidence: number,
  regime: string | null,
): { passes: boolean; reason?: string } {
  const threshold = CONFIDENCE_THRESHOLDS[regime ?? ''] ?? 0.80
  if (confidence < threshold) {
    return {
      passes: false,
      reason: `Gate 0: confidence ${confidence.toFixed(2)} < ${threshold} required for ${regime ?? 'unknown'} regime`,
    }
  }
  return { passes: true }
}

// ============================================================
// INDICATOR INTERPRETATION HELPERS
// ============================================================

function rsiLabel(rsi: number | null): string {
  if (rsi === null) return ''
  if (rsi > 70) return '(OVERBOUGHT — caution on new longs)'
  if (rsi < 30) return '(OVERSOLD — potential reversal opportunity)'
  if (rsi > 60) return '(elevated momentum)'
  if (rsi < 40) return '(weak momentum, potential entry zone)'
  return '(neutral)'
}

function macdLabel(macd: TechnicalIndicators['macd']): string {
  if (!macd) return ''
  if (macd.histogram > 0 && macd.macdLine > macd.signalLine) return '(BULLISH — momentum increasing)'
  if (macd.histogram < 0 && macd.macdLine < macd.signalLine) return '(BEARISH — momentum decreasing)'
  if (macd.histogram > 0) return '(bullish histogram)'
  return '(bearish histogram)'
}

function bbLabel(bb: TechnicalIndicators['bollingerBands']): string {
  if (!bb) return ''
  if (bb.percentB > 1) return '(ABOVE upper band — overbought territory)'
  if (bb.percentB < 0) return '(BELOW lower band — oversold territory)'
  if (bb.percentB > 0.8) return '(near upper band)'
  if (bb.percentB < 0.2) return '(near lower band — potential support)'
  return '(mid-range)'
}

function smaLabel(price: number, sma: number | null, period: number): string {
  if (!sma) return 'N/A'
  const pct = ((price - sma) / sma * 100).toFixed(1)
  return `$${sma.toFixed(2)} (${price > sma ? '+' : ''}${pct}% — ${price > sma ? 'ABOVE' : 'BELOW'} SMA${period})`
}

function kalmanLabel(kalman: TechnicalIndicators['kalman']): string {
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
    `Z-Score: ${kalman.zScore.toFixed(3)} (entry threshold: < -1.3 | exit threshold: >= -0.5)`,
    `Signal: ${signalMap[kalman.signal]}`,
  ].join('\n')
}

// ============================================================
// BUILD ENRICHED PROMPT PER SYMBOL
// ============================================================

function buildEnrichedPrompt(
  symbol: string,
  indicators: TechnicalIndicators,
  account: AlpacaAccount,
  positions: AlpacaPosition[],
  learningContext: string,
  macroContext: string,
  symbolNews: AlpacaNewsArticle[],
  watchlistContext?: string,
  effectiveThreshold?: number,
  learnContext?: LearnContext,
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

--- RECENT NEWS FOR ${symbol} (last 24h) ---
${symbolNewsSection}

--- MARKET DATA ---
Current Price: $${indicators.currentPrice.toFixed(2)}
Volume: ${indicators.volume.toLocaleString()}

--- PRIMARY SIGNAL: KALMAN FILTER (E.P. Chan) ---
${kalmanLabel(indicators.kalman)}

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
` : ''}${effectiveThreshold !== undefined && effectiveThreshold !== -1.3 ? `
--- NEWS-ADJUSTED THRESHOLD ---
Entry threshold for this cycle: ${effectiveThreshold.toFixed(3)} (base: -1.3, news adjustment: ${(effectiveThreshold - (-1.3)).toFixed(3)})
` : ''}
Analyze ${symbol} and provide your trading decision as JSON.${learnContext ? `

=== LEARN MODE — PRE-FILTER FLAGS ===
These conditions were flagged but did NOT block execution.
Evaluate the full setup and provide your decision regardless.

Flags: ${JSON.stringify(learnContext.flags, null, 2)}

Include these fields in your JSON response:
- "learning_note": string — what this case teaches about the setup
- "near_miss_score": number (1-10) — setup quality score
- "what_would_trigger": string — what specific condition needs to change for a BUY
=====================================` : ''}`
}

// ============================================================
// CLAUDE API — RETRY WITH EXPONENTIAL BACKOFF
// ============================================================

const RETRYABLE_STATUS_CODES = new Set([429, 529])

async function callClaudeWithRetry(
  client: Anthropic,
  params: Parameters<Anthropic['messages']['create']>[0],
  maxRetries = 4
): Promise<Anthropic.Message> {
  let lastError: unknown
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await client.messages.create(params) as Anthropic.Message
    } catch (err) {
      lastError = err
      const status = (err as { status?: number }).status
      if (!status || !RETRYABLE_STATUS_CODES.has(status)) throw err

      if (attempt < maxRetries) {
        const delayMs = Math.min(1000 * 2 ** attempt, 30_000) + Math.random() * 500
        console.warn(`Claude API ${status} (attempt ${attempt + 1}/${maxRetries}) — retrying in ${Math.round(delayMs)}ms`)
        await new Promise((r) => setTimeout(r, delayMs))
      }
    }
  }
  throw lastError
}

// ============================================================
// EXECUTION GATES
// ============================================================

function checkLiquidity(prevDayVolume: number): boolean {
  return prevDayVolume >= 1_000_000
}

function checkTradingHours(): boolean {
  const now = new Date()
  const etFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  })
  const parts = etFormatter.formatToParts(now)
  const hour = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10)
  const minute = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10)
  const totalMinutes = hour * 60 + minute
  // 9:45 AM ET = 585 minutes, 3:30 PM ET = 930 minutes
  return totalMinutes >= 585 && totalMinutes <= 930
}

async function checkOvertradingLimit(): Promise<boolean> {
  const count = await getTodayBuyExecutions()
  return count < 3
}

function regimeMultiplier(regime: string | null): number {
  const map: Record<string, number> = {
    TRENDING: 1.0,
    TRANSITION: 0.75,
    RANGING: 0.5,
    HIGH_VOLATILITY: 0.25,
  }
  return regime ? (map[regime] ?? 1.0) : 1.0
}

// ============================================================
// POSITION SIZING
// ============================================================

// Kovner 1-2% Rule: risk at most 1% of equity per trade
// risk_per_share = entry_price * stop_loss_pct
// quantity = capital_at_risk / risk_per_share
// regime multiplier applied first, then undertrade halving if Kalman NEUTRAL
function calculateBuyQuantity(
  currentPrice: number,
  portfolioEquity: number,
  availableCash: number,
  kalmanSignal?: string,
  marketRegime?: string | null
): number {
  const riskPct = parseFloat(process.env.RISK_PCT ?? '0.01')
  const stopLossPct = parseFloat(process.env.STOP_LOSS_PCT ?? '0.05')

  const capitalAtRisk = portfolioEquity * riskPct
  const riskPerShare = currentPrice * stopLossPct
  if (riskPerShare === 0) return 0

  let qty = Math.floor(capitalAtRisk / riskPerShare)

  // Regime multiplier (applied before Kalman undertrade)
  const regimeMult = regimeMultiplier(marketRegime ?? null)
  qty = Math.floor(qty * regimeMult)

  // Undertrade mandate (Seykota): halve position if no Kalman confirmation
  if (!kalmanSignal || kalmanSignal === 'NEUTRAL') {
    qty = Math.floor(qty / 2)
  }

  // Safety cap A: never exceed 95% of available cash
  const maxAffordable = Math.floor((availableCash * 0.95) / currentPrice)
  // Safety cap B: never exceed 10% of total equity (prevents oversizing on cheap stocks)
  const maxByEquity = Math.floor((portfolioEquity * 0.10) / currentPrice)
  return Math.max(0, Math.min(qty, Math.min(maxAffordable, maxByEquity)))
}

// ============================================================
// STOP LOSS ENFORCEMENT (Capa B — manual safety check each cycle)
// ============================================================

async function enforceStopLosses(positions: AlpacaPosition[]): Promise<void> {
  const stopLossPct = parseFloat(process.env.STOP_LOSS_PCT ?? '0.05')
  let openContexts
  try {
    openContexts = await getAllOpenPositionContexts()
  } catch {
    return
  }

  for (const ctx of openContexts) {
    const alpacaPos = positions.find((p) => p.symbol === ctx.symbol)
    if (!alpacaPos) continue // already closed

    const currentPrice = parseFloat(alpacaPos.current_price)
    const stopPrice = ctx.buyPrice * (1 - stopLossPct)

    if (currentPrice <= stopPrice) {
      console.warn(`[enforceStopLosses] Stop triggered: ${ctx.symbol} @ $${currentPrice.toFixed(2)} <= stop $${stopPrice.toFixed(2)}`)
      try {
        await closePosition(ctx.symbol)
      } catch (err) {
        console.error(`[enforceStopLosses] Failed to close ${ctx.symbol}:`, err)
      }
    }
  }
}

// ============================================================
// MAIN AGENT CYCLE
// ============================================================

export interface AgentCycleResult {
  decisions: AgentLogEntry[]
  evaluations: TradeEvaluation[]
  marketOpen: boolean
  timestamp: string
}

export async function runAgentCycle(): Promise<AgentCycleResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')
  if (!process.env.ALPACA_API_KEY) throw new Error('ALPACA_API_KEY is not set')

  const timestamp = new Date().toISOString()
  const client = new Anthropic({ apiKey })

  // 1. Load portfolio state and market status
  const [account, positions, clock] = await Promise.all([
    getAccount(),
    getPositions(),
    getClock(),
  ])

  // 2. Dynamic stock selection — fallback to static watchlist if screener unavailable
  let watchlist: string[]
  try {
    const candidates = await getMarketMovers(30)
    if (candidates.length >= 10) {
      watchlist = await selectStocksForAnalysis(candidates, account, positions)
      console.log(`Dynamic selection: ${watchlist.join(', ')}`)
    } else {
      throw new Error('Not enough screener candidates')
    }
  } catch (err) {
    console.warn('Dynamic selection failed, using static watchlist:', err)
    watchlist = (process.env.TRADING_WATCHLIST ?? 'AAPL,MSFT,NVDA,XOM,CVX,MP,NEM,GOOGL,META')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  }

  const marketOpen = clock.is_open

  // 3. Enforce stop losses — close any positions that fell through Alpaca's stop order
  await enforceStopLosses(positions)

  // 4. Fetch macro news once — shared across all symbol analyses in this cycle
  const macroNews = await getMacroNews(12, 8).catch(() => [] as AlpacaNewsArticle[])
  const macroContext = macroNews.length > 0
    ? macroNews.map((n) => `• ${n.headline} (${new Date(n.created_at).toLocaleTimeString('en-US')})`).join('\n')
    : 'No major macro news in the last 12 hours.'

  // 4a. Pre-compute indicators for all watchlist symbols (needed by news + watchlist layers)
  const indicatorsCache = new Map<string, TechnicalIndicators>()
  for (const sym of watchlist) {
    try {
      const bars = await getBars(sym, '1Day', 260, 250)
      if (bars.length >= 30) {
        indicatorsCache.set(sym, calculateAllIndicators(bars))
      }
    } catch (err) {
      console.warn(`[PRE-PASS] Failed to compute indicators for ${sym}:`, err)
    }
  }

  // 4b. News Intelligence Layer — classify news and build dynamic threshold map
  const defaultThresholds: ThresholdMap = { __MACRO__: 0 }
  for (const s of watchlist) defaultThresholds[s] = -1.3

  const thresholdMap = await newsIntelligenceLayer(watchlist).catch((err) => {
    console.error('[NEWS] Layer failed, using defaults:', err)
    return defaultThresholds
  })

  // 4c. Watchlist Monitor — update active entries + detect auto-entries
  const currentIndicatorsRecord = Object.fromEntries(indicatorsCache)
  await updateWatchlist(thresholdMap, currentIndicatorsRecord).catch((err) => {
    console.error('[WATCHLIST] Update failed:', err)
  })
  const autoEntrySymbols = await checkAutoEntry(
    thresholdMap, currentIndicatorsRecord, positions.length
  ).catch((err) => {
    console.error('[WATCHLIST] checkAutoEntry failed:', err)
    return [] as string[]
  })
  if (autoEntrySymbols.length > 0) {
    console.log(`[WATCHLIST] Auto-entry candidates: ${autoEntrySymbols.join(', ')}`)
  }

  // 4d. Ensure all open positions have indicators even if not selected in watchlist this cycle
  for (const position of positions) {
    if (!indicatorsCache.has(position.symbol)) {
      try {
        const bars = await getBars(position.symbol, '1Day', 260, 250)
        const indicators = calculateAllIndicators(bars)
        indicatorsCache.set(position.symbol, indicators)
        console.log(`[EXIT-RULES] Computed indicators for open position ${position.symbol} (not in watchlist this cycle)`)
      } catch (err) {
        console.error(`[EXIT-RULES] Failed to compute indicators for ${position.symbol}:`, err)
      }
    }
  }

  // 4e. Enforce deterministic exit rules (z-score reversion, profit target, time stop)
  // Runs after indicators cache is built — needs z-scores to evaluate exits
  const exitRuleEntries = await (async () => {
    try {
      const openCtxs = await getAllOpenPositionContexts()
      return await enforceExitRules(positions, indicatorsCache, openCtxs)
    } catch (err) {
      console.error('[EXIT-RULES] enforceExitRules failed:', err)
      return [] as AgentLogEntry[]
    }
  })()

  // 5. Evaluate closed positions (learning loop)
  const evaluations: TradeEvaluation[] = []
  const closedContexts = await detectClosedPositions(positions)

  for (const ctx of closedContexts) {
    try {
      const sellOrder = await getLatestSellOrder(ctx.symbol, ctx.buyTimestamp)
      const sellPrice = sellOrder?.filled_avg_price
        ? parseFloat(sellOrder.filled_avg_price)
        : ctx.buyPrice
      const sellTimestamp = sellOrder?.filled_at ?? timestamp

      const evaluation = await evaluateClosedTrade(ctx, sellPrice, sellTimestamp)
      evaluations.push(evaluation)
      await removeOpenPositionContext(ctx.symbol)
      await recordSelectionOutcome(ctx.symbol, evaluation)
    } catch (err) {
      console.error(`Failed to evaluate closed trade for ${ctx.symbol}:`, err)
    }
  }

  // 6. Analysis cycle for each symbol
  // Seed decisions with any deterministic exits that already fired this cycle
  const decisions: AgentLogEntry[] = [...exitRuleEntries]

  for (const symbol of watchlist) {
    try {
      // Use pre-computed indicators from pre-pass (avoids double bar fetch)
      const indicators = indicatorsCache.get(symbol)
      if (!indicators) {
        console.warn(`[MAIN-LOOP] No indicators for ${symbol}, skipping`)
        decisions.push({
          id: randomUUID(),
          timestamp,
          symbol,
          decision: { action: 'HOLD', symbol, quantity: 0, reasoning: '', confidence: 0 },
          indicators: { rsi: null, macd: null, bollingerBands: null, sma50: null, sma200: null, ema50: null, ema200: null, distanceToEma50Pct: null, kalman: null, currentPrice: 0, volume: 0, prevDayVolume: 0, adx: null, atr: null, atrPercentile: null, marketRegime: null },
          portfolioSnapshot: { equity: account.equity, cash: account.cash, positionCount: positions.length },
          orderExecuted: false,
          error: 'Skipped: no indicators available in cache',
        })
        continue
      }

      // Check if this symbol has a pending auto-entry from the watchlist monitor
      const isAutoEntry = autoEntrySymbols.includes(symbol)

      // Generate signal type (mean reversion vs trend following) before filtering
      const signalResult = generateSignalType(indicators)
      console.log(`[SIGNAL] ${symbol}: ${signalResult.type} (confidence ${signalResult.confidence.toFixed(2)})`)

      // Position rotation: if portfolio is full and signal is strong, try to swap weakest position
      if (positions.length >= 5 && signalResult.type !== 'NO_SIGNAL') {
        const rotation = await evaluateRotation(signalResult, positions, indicatorsCache)
        if (rotation.rotate && rotation.exitSymbol) {
          console.log(`[ROTATION] Closing ${rotation.exitSymbol} to make room for ${symbol}: ${rotation.reason}`)
          try {
            await closePosition(rotation.exitSymbol)
            decisions.push({
              id: randomUUID(),
              timestamp,
              symbol: rotation.exitSymbol,
              decision: { action: 'SELL', symbol: rotation.exitSymbol, quantity: 0, reasoning: `Rotation: ${rotation.reason}`, confidence: 1.0 },
              indicators: indicatorsCache.get(rotation.exitSymbol) ?? indicators,
              portfolioSnapshot: { equity: account.equity, cash: account.cash, positionCount: positions.length },
              orderExecuted: true,
            })
            // Optimistically remove from positions so BUY gates pass this cycle
            const rotatedPositions = positions.filter((p) => p.symbol !== rotation.exitSymbol)
            positions.splice(0, positions.length, ...rotatedPositions)
          } catch (err) {
            console.error(`[ROTATION] Failed to close ${rotation.exitSymbol}:`, err)
          }
        } else {
          console.log(`[ROTATION] ${symbol}: ${rotation.reason} — skipping`)
        }
      }

      // Pre-filter: LEARN mode — collect flags but always proceed to Claude
      // Auto-entry symbols bypass the pre-filter — conditions already met
      const portfolioDrawdownPct = (parseFloat(account.equity) - 100000) / 100000
      const { learnContext } = isAutoEntry
        ? { learnContext: null }
        : preClaudeFilter(symbol, indicators, positions, thresholdMap, parseFloat(account.equity), portfolioDrawdownPct)

      if (learnContext) {
        const flagSummary = learnContext.flags.map(f => f.detail).join('; ')
        console.log(`[LEARN-MODE] ${symbol}: flags detected (${flagSummary}) — proceeding to Claude`)
      }

      // Detect near-misses for z-scores in the near-miss zone (-1.0 to threshold)
      const zscore = indicators.kalman?.zScore ?? 0
      if (zscore <= -1.0) {
        await detectNearMisses(symbol, indicators, thresholdMap).catch(() => {})
      }

      // Build learning context (same for all symbols in this cycle — cached reads)
      const learningContext = await buildLearningContext(indicators)

      // Fetch symbol-specific news
      const symbolNews = await getNewsForSymbols([symbol], 24, 5).catch(() => [] as AlpacaNewsArticle[])

      // Build watchlist context if this is an auto-entry
      let watchlistContext: string | undefined
      const effectiveThreshold = thresholdMap[symbol] ?? -1.3
      if (isAutoEntry) {
        const watchlistEntry = await getActiveNearMissForSymbol(symbol).catch(() => null)
        if (watchlistEntry) {
          const boostNote = watchlistEntry.news_boost_applied !== 0
            ? ` News boost applied: ${watchlistEntry.news_boost_applied.toFixed(3)} (threshold relaxed to ${watchlistEntry.effective_threshold.toFixed(3)}).`
            : ''
          watchlistContext = `This symbol was in the Near-Miss Watchlist for ${watchlistEntry.monitoring_cycles} cycles. ` +
            `Initial z-score: ${watchlistEntry.initial_zscore.toFixed(3)}. Current z-score now meets entry threshold.${boostNote} ` +
            `This is a monitored entry — higher conviction expected.`
        }
      }

      const userPrompt = buildEnrichedPrompt(
        symbol,
        indicators,
        account,
        positions,
        learningContext,
        macroContext,
        symbolNews,
        watchlistContext,
        effectiveThreshold,
        learnContext ?? undefined,
      )

      // Call Claude (with retry on 429/529)
      const response = await callClaudeWithRetry(client, {
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      })

      const content = response.content[0]
      if (content.type !== 'text') throw new Error('Unexpected Claude response type')

      const jsonText = content.text.replace(/```json\n?|\n?```/g, '').trim()
      const decision = JSON.parse(jsonText) as AgentDecision
      decision.symbol = symbol // ensure symbol matches

      let orderExecuted = false
      let orderId: string | undefined
      let error: string | undefined

      // Regime gate: override if Claude returned regime_compatible=false (Fix #2)
      if (decision.action !== 'HOLD' && decision.regime_compatible === false) {
        error = `Regime gate: Claude set regime_compatible=false — ${decision.reasoning.slice(0, 80)}`
        decision.action = 'HOLD'
      }

      // Gate 0: regime-adjusted confidence threshold (Fix #3)
      const confidenceCheck = passesConfidenceGate(decision.confidence, indicators.marketRegime)
      if (decision.action !== 'HOLD' && !confidenceCheck.passes) {
        error = confidenceCheck.reason
        decision.action = 'HOLD'
      }

      // Execute order if market is open and decision is actionable
      if (decision.action !== 'HOLD') {
        if (!marketOpen) {
          error = 'Market closed — order queued but not executed'
        } else {
          try {
            if (decision.action === 'BUY') {
              // Gate 1: liquidity
              if (!checkLiquidity(indicators.prevDayVolume)) {
                error = `Liquidity gate: prev day volume ${indicators.prevDayVolume.toLocaleString()} < 1,000,000`
                decision.action = 'HOLD'
              }
              // Gate 2: trading hours
              else if (!checkTradingHours()) {
                error = 'Trading hours gate: outside 9:45am–3:30pm ET window'
                decision.action = 'HOLD'
              }
              // Gate 3: overtrading limit
              else if (!(await checkOvertradingLimit())) {
                error = 'Overtrading gate: 3 BUYs already executed today'
                decision.action = 'HOLD'
              }
              // Gate 4: portfolio risk / drawdown / correlation
              else {
                const openContexts = await getAllOpenPositionContexts()
                const { data: recentLog } = await import('./db').then(async (m) => {
                  const log = await m.getAgentLog(200)
                  return { data: log }
                })
                const riskCheck = await isNewPositionAllowed(
                  symbol, account, positions, openContexts, recentLog
                )
                if (!riskCheck.allowed) {
                  error = riskCheck.reason ?? 'Portfolio risk gate: position not allowed'
                  decision.action = 'HOLD'
                }
              }

              if (decision.action === 'BUY') {
              const qty = calculateBuyQuantity(
                indicators.currentPrice,
                parseFloat(account.equity),
                parseFloat(account.buying_power),
                indicators.kalman?.signal,
                indicators.marketRegime
              )
              console.log(`[BUY SIZING] ${symbol}: qty=${qty} | price=$${indicators.currentPrice} | equity=$${account.equity} | regime=${indicators.marketRegime}`)
              if (qty > 0) {
                const order = await submitOrder(symbol, qty, 'buy')
                orderId = order.id
                orderExecuted = true
                decision.quantity = qty

                // Submit GTC stop order immediately (Capa A protection)
                const stopLossPct = parseFloat(process.env.STOP_LOSS_PCT ?? '0.05')
                const stopPrice = indicators.currentPrice * (1 - stopLossPct)
                let stopOrderId: string | undefined
                try {
                  const stopOrder = await submitStopOrder(symbol, qty, stopPrice)
                  stopOrderId = stopOrder.id
                } catch (stopErr) {
                  console.warn(`Failed to submit stop order for ${symbol}:`, stopErr)
                }

                // Save buy context for future learning
                const entryLogId = randomUUID()
                await saveOpenPositionContext({
                  symbol,
                  buyTimestamp: timestamp,
                  buyPrice: indicators.currentPrice,
                  quantity: qty,
                  indicators,
                  claudeReasoning: decision.reasoning,
                  patternIdsUsed: [],
                  stopOrderId,
                })

                // If this BUY came from the Near-Miss Watchlist, link the log entry
                if (isAutoEntry) {
                  await markWatchlistTriggered(symbol, entryLogId).catch(() => {})
                }
              } else {
                error = 'Insufficient buying power for position'
              }
              } // end inner if (decision.action === 'BUY') after gates
            } else if (decision.action === 'SELL') {
              const hasPosition = positions.some((p) => p.symbol === symbol)
              if (hasPosition) {
                const order = await closePosition(symbol)
                orderId = order.id
                orderExecuted = true
              } else {
                error = 'No position to sell'
                decision.action = 'HOLD'
              }
            }
          } catch (execErr) {
            error = String(execErr)
          }
        }
      }

      // Merge learning fields into indicators jsonb so dashboard can read them
      const indicatorsWithLearning = {
        ...indicators,
        ...(decision.learning_note !== undefined && { learning_note: decision.learning_note }),
        ...(decision.near_miss_score !== undefined && { near_miss_score: decision.near_miss_score }),
        ...(decision.what_would_trigger !== undefined && { what_would_trigger: decision.what_would_trigger }),
      }

      // If pre-filter flags were raised, store them in error field for display
      const preFilterError = learnContext
        ? `Pre-filter flags: ${JSON.stringify(learnContext.flags)}`
        : undefined

      const entry: AgentLogEntry = {
        id: randomUUID(),
        timestamp,
        symbol,
        decision,
        indicators: indicatorsWithLearning,
        portfolioSnapshot: {
          equity: account.equity,
          cash: account.cash,
          positionCount: positions.length,
        },
        orderExecuted,
        orderId,
        error: error ?? preFilterError,
      }

      decisions.push(entry)
    } catch (err) {
      console.error(`Error analyzing ${symbol}:`, err)
      decisions.push({
        id: randomUUID(),
        timestamp,
        symbol,
        decision: { action: 'HOLD', symbol, quantity: 0, reasoning: 'Analysis failed', confidence: 0 },
        indicators: { rsi: null, macd: null, bollingerBands: null, sma50: null, sma200: null, ema50: null, ema200: null, distanceToEma50Pct: null, kalman: null, currentPrice: 0, volume: 0, prevDayVolume: 0, adx: null, atr: null, atrPercentile: null, marketRegime: null },
        portfolioSnapshot: { equity: account.equity, cash: account.cash, positionCount: positions.length },
        orderExecuted: false,
        error: String(err),
      })
    }
  }

  await appendAgentLogEntries(decisions)

  return { decisions, evaluations, marketOpen, timestamp }
}
