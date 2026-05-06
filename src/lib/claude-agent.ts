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
import { getAllOpenPositionContexts, getTodayBuyExecutions, insertAgentLogEntry, updatePositionContext } from './db'
import { isNewPositionAllowed } from './risk-manager'
import { selectStocksForAnalysis, recordSelectionOutcome } from './stock-selector'
import { newsIntelligenceLayer } from './news-intelligence'
import { ZSCORE_ENTRY_THRESHOLD } from './config'
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
  OpenPositionContext,
  TechnicalIndicators,
  TradeEvaluation,
  ThresholdMap,
  LearnContext,
} from './types'

// ============================================================
// SYSTEM PROMPT (static — defines Claude's role)
// ============================================================

const SYSTEM_PROMPT = `You are a trading analyst. Your role is to:
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
  "what_would_trigger": "what specific condition would strengthen the signal"
}`

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

export async function enforceExitRules(
  positions: AlpacaPosition[],
  indicatorsCache: Map<string, TechnicalIndicators>,
  openContexts: OpenPositionContext[],
  account: AlpacaAccount,
): Promise<AgentLogEntry[]> {
  const exitEntries: AgentLogEntry[] = []
  const timestamp = new Date().toISOString()

  for (const position of positions) {
    const ind = indicatorsCache.get(position.symbol)
    if (!ind?.kalman) {
      console.log(`[EXIT-RULES] Skipping ${position.symbol}: no kalman indicators in cache`)
      await insertAgentLogEntry({
        id: randomUUID(),
        timestamp,
        symbol: position.symbol,
        decision: { action: 'HOLD', symbol: position.symbol, quantity: 0, reasoning: 'EXIT-RULES: skipped — no kalman indicators in cache', confidence: 0 },
        indicators: ind ?? { rsi: null, macd: null, bollingerBands: null, sma50: null, sma200: null, ema50: null, ema200: null, distanceToEma50Pct: null, kalman: null, currentPrice: 0, volume: 0, prevDayVolume: 0, adx: null, atr: null, atrPercentile: null, marketRegime: null },
        portfolioSnapshot: { equity: account.equity, cash: account.cash, positionCount: positions.length },
        orderExecuted: false,
        error: 'exit_rules_skip',
      }).catch((err) => console.error(`[EXIT-RULES] Failed to log skip for ${position.symbol}:`, err))
      continue
    }

    const zScore = ind.kalman.zScore
    const pnlPct = parseFloat(position.unrealized_plpc)
    const ctx = openContexts.find((c) => c.symbol === position.symbol)
    const daysOpen = ctx ? getTradingDaysOpen(ctx.buyTimestamp) : 0
    const signalType = ctx?.signalType ?? null

    let exitReason: string | null = null

    // Universal exits — checked first, always take priority over signal-type rules
    if (pnlPct >= 0.10) {
      exitReason = `Exit rule: profit target reached (${(pnlPct * 100).toFixed(1)}% >= 10%)`
    }
    if (!exitReason && daysOpen >= 20) {
      exitReason = `Exit rule: 20-day time stop (${daysOpen} trading days open)`
    }

    // Mean Reversion exits
    if (!exitReason && signalType === 'MEAN_REVERSION') {
      if (zScore >= -0.8) {
        exitReason = `Exit rule: z-score ${zScore.toFixed(3)} >= -0.8 — price reverted to fair value`
      }
    }

    // Trend exits (covers legacy TREND + new TREND_PULLBACK + TREND_ZLE05)
    if (!exitReason && (signalType === 'TREND' || signalType === 'TREND_PULLBACK' || signalType === 'TREND_ZLE05')) {
      if (ind.ema50 !== null && ind.currentPrice < ind.ema50) {
        exitReason = `Exit rule: price $${ind.currentPrice.toFixed(2)} fell below EMA50 $${ind.ema50.toFixed(2)}`
      }
    }

    // EMA Reclaim exit — reclaim failed if price falls back below EMA50
    if (!exitReason && signalType === 'EMA_RECLAIM') {
      if (ind.ema50 !== null && ind.currentPrice < ind.ema50) {
        exitReason = `Exit rule: EMA Reclaim failed — price $${ind.currentPrice.toFixed(2)} fell below EMA50 $${ind.ema50.toFixed(2)}`
      }
    }

    // Legacy positions (signal_type === null): profit target + time stop only
    // z-score exit NOT applied to unknown entries

    // ── TRAILING STOP ──────────────────────────────────────────
    const ACTIVATION_PCT: Record<string, number> = {
      MEAN_REVERSION: 0.05,
      TREND_PULLBACK: 0.06,
      TREND_ZLE05:    0.06,
      EMA_RECLAIM:    0.04,
      default:        0.05,
    }
    const ATR_MULT: Record<string, number> = {
      MEAN_REVERSION: 1.2,
      TREND_PULLBACK: 1.5,
      TREND_ZLE05:    1.5,
      EMA_RECLAIM:    1.0,
      default:        1.2,
    }
    const MIN_DISTANCE_PCT = 0.015
    const currentPrice = parseFloat(position.current_price)
    const atr = ind.atr ?? null

    // PASO 1 — Update high_since_entry first
    let highSinceEntry = ctx?.highSinceEntry ?? currentPrice
    const madeNewHigh = currentPrice > highSinceEntry
    if (madeNewHigh) highSinceEntry = currentPrice

    // PASO 2 — Skip if ATR invalid
    if (!atr || atr <= 0) {
      await updatePositionContext(position.symbol, { highSinceEntry }).catch(
        (err: unknown) => console.error(`[EXIT-RULES] Failed to update trailing context for ${position.symbol}:`, err)
      )
    } else {
      // PASO 3 — Activate trailing (once only)
      const activationPct = ACTIVATION_PCT[signalType ?? 'default']
      let trailingActivated = ctx?.trailingActivated ?? false
      let justActivated = false

      if (!trailingActivated && pnlPct >= activationPct) {
        trailingActivated = true
        justActivated = true
      }

      // PASO 4 — Calculate trailing stop (only rises)
      let trailingStop = ctx?.trailingStop ?? null

      if (trailingActivated && !justActivated) {
        const mult = ATR_MULT[signalType ?? 'default']
        const distance = Math.max(mult * atr, highSinceEntry * MIN_DISTANCE_PCT)
        const newStop = highSinceEntry - distance

        // Guardrail: ignore if stop is corrupt
        if (trailingStop !== null && trailingStop >= highSinceEntry) {
          trailingStop = newStop
        } else {
          trailingStop = Math.max(trailingStop ?? 0, newStop)
        }
      }

      // Save updated context
      await updatePositionContext(position.symbol, {
        highSinceEntry,
        trailingStop,
        trailingActivated,
      }).catch(
        (err: unknown) => console.error(`[EXIT-RULES] Failed to update trailing context for ${position.symbol}:`, err)
      )

      // PASO 5 — Evaluate exit
      if (
        trailingActivated &&
        !justActivated &&
        !madeNewHigh &&
        trailingStop !== null &&
        currentPrice <= trailingStop
      ) {
        exitReason = `Trailing stop triggered: ` +
          `price $${currentPrice.toFixed(2)} ` +
          `<= stop $${trailingStop.toFixed(2)} ` +
          `(high: $${highSinceEntry.toFixed(2)})`
      }
    }
    // ──────────────────────────────────────────────────────────

    if (!exitReason) {
      console.log(`[EXIT-RULES] No exit for ${position.symbol}: pnlPct=${pnlPct.toFixed(4)}, zScore=${zScore.toFixed(3)}, signalType=${signalType}, daysOpen=${daysOpen}`)
      await insertAgentLogEntry({
        id: randomUUID(),
        timestamp,
        symbol: position.symbol,
        decision: { action: 'HOLD', symbol: position.symbol, quantity: 0, reasoning: `EXIT-RULES: no exit triggered — pnlPct=${pnlPct.toFixed(4)}, zScore=${zScore.toFixed(3)}, signalType=${signalType}, daysOpen=${daysOpen}, highSinceEntry=$${highSinceEntry.toFixed(2)}`, confidence: 0 },
        indicators: ind,
        portfolioSnapshot: { equity: account.equity, cash: account.cash, positionCount: positions.length },
        orderExecuted: false,
        error: 'exit_rules_check',
      }).catch((err) => console.error(`[EXIT-RULES] Failed to log check for ${position.symbol}:`, err))
      continue
    }

    console.log(`[EXIT-RULES] Closing ${position.symbol} [${signalType ?? 'legacy'}]: ${exitReason}`)
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
    kalman && kalman.zScore < ZSCORE_ENTRY_THRESHOLD &&
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
    `Z-Score: ${kalman.zScore.toFixed(3)} (entry threshold: < ${ZSCORE_ENTRY_THRESHOLD} | exit threshold: >= -0.5)`,
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
` : ''}${effectiveThreshold !== undefined && effectiveThreshold !== ZSCORE_ENTRY_THRESHOLD ? `
--- NEWS-ADJUSTED THRESHOLD ---
Entry threshold for this cycle: ${effectiveThreshold.toFixed(3)} (base: ${ZSCORE_ENTRY_THRESHOLD}, news adjustment: ${(effectiveThreshold - ZSCORE_ENTRY_THRESHOLD).toFixed(3)})
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
  return count < 5
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

  // If market closed and no open positions, skip entire cycle — nothing to do
  if (!marketOpen && positions.length === 0) {
    console.log('[AGENT] Market closed, no open positions — skipping cycle')
    return { decisions: [], evaluations: [], marketOpen, timestamp }
  }

  // If market closed but has open positions, log and continue — exits can still fire,
  // BUYs are blocked downstream by the marketOpen gate
  if (!marketOpen && positions.length > 0) {
    console.log('[AGENT] Market closed — running exit evaluation only')
  }

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
      const bars = await getBars(sym, '1Day', 300, 300)
      if (bars.length >= 30) {
        indicatorsCache.set(sym, calculateAllIndicators(bars))
      }
    } catch (err) {
      console.warn(`[PRE-PASS] Failed to compute indicators for ${sym}:`, err)
    }
  }

  // 4b. News Intelligence Layer — classify news and build dynamic threshold map
  const defaultThresholds: ThresholdMap = { __MACRO__: 0 }
  for (const s of watchlist) defaultThresholds[s] = ZSCORE_ENTRY_THRESHOLD

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
    // Ensure auto-entry symbols have indicators and are included in this cycle's analysis
    for (const sym of autoEntrySymbols) {
      if (!indicatorsCache.has(sym)) {
        try {
          const bars = await getBars(sym, '1Day', 300, 300)
          const ind = calculateAllIndicators(bars)
          indicatorsCache.set(sym, ind)
          console.log(`[WATCHLIST] Fetched indicators for auto-entry symbol ${sym}`)
        } catch (err) {
          console.error(`[WATCHLIST] Failed to fetch indicators for auto-entry ${sym}:`, err)
        }
      }
      if (!watchlist.includes(sym)) {
        watchlist.push(sym)
        console.log(`[WATCHLIST] Injected ${sym} into watchlist for priority auto-entry processing`)
      }
    }
  }
  const prioritySymbols = new Set(autoEntrySymbols)

  // 4d. Ensure all open positions have indicators even if not selected in watchlist this cycle
  for (const position of positions) {
    if (!indicatorsCache.has(position.symbol)) {
      try {
        const bars = await getBars(position.symbol, '1Day', 300, 300)
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
      return await enforceExitRules(positions, indicatorsCache, openCtxs, account)
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

      // Log ghost close to agent_log so it appears in Agent Decisions dashboard
      const pnlPct = (sellPrice - ctx.buyPrice) / ctx.buyPrice
      const daysOpen = getTradingDaysOpen(ctx.buyTimestamp)
      await insertAgentLogEntry({
        id: randomUUID(),
        timestamp: sellTimestamp,
        symbol: ctx.symbol,
        decision: {
          action: 'SELL',
          symbol: ctx.symbol,
          quantity: ctx.quantity,
          reasoning: `Position closed by Alpaca automatically (stop loss or external order). Entry: $${ctx.buyPrice.toFixed(2)} Exit: $${sellPrice.toFixed(2)} P&L: ${pnlPct > 0 ? '+' : ''}${(pnlPct * 100).toFixed(2)}% Signal type: ${ctx.signalType} Days open: ${daysOpen}`,
          confidence: 1.0,
        },
        indicators: {
          ...ctx.indicators,
          entryPrice: ctx.buyPrice,
          exitPrice: sellPrice,
          pnlPct,
          signalType: ctx.signalType,
          daysOpen,
          closedBy: 'alpaca_gtc',
        } as unknown as TechnicalIndicators,
        portfolioSnapshot: {
          equity: account.equity,
          cash: account.cash,
          positionCount: positions.length,
        },
        orderExecuted: true,
        error: 'ghost_close',
      }).catch((err) => console.error(`[GHOST-CLOSE] Failed to insert agent_log for ${ctx.symbol}:`, err))
    } catch (err) {
      console.error(`Failed to evaluate closed trade for ${ctx.symbol}:`, err)
    }
  }

  // 6. Analysis cycle for each symbol
  // Seed decisions with any deterministic exits that already fired this cycle
  const decisions: AgentLogEntry[] = [...exitRuleEntries]

  const maxPositions = parseInt(process.env.MAX_POSITIONS ?? '5', 10)
  const maxBuysPerDay = 5
  let openPositionsCount = positions.length
  let buysToday = await getTodayBuyExecutions()

  const buyQueue: Array<{
    symbol: string
    zScore: number
    confidence: number
    signalType: string | null
    indicators: TechnicalIndicators
    decision: AgentDecision
    entry: AgentLogEntry
    qty: number
    isAutoEntry: boolean
  }> = []
  const slotsAvailable = maxPositions - openPositionsCount

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
      const isAutoEntry = prioritySymbols.has(symbol)

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

      // Step 1: Setup Detection — hard gate before calling Claude
      const zScore = indicators.kalman?.zScore ?? 0
      const ema50Value = indicators.ema50 ?? 0
      const ema200Value = indicators.ema200 ?? 0

      // Effective threshold — news-adjusted, must be calculated before setup gate
      const effectiveThreshold = thresholdMap[symbol] ?? ZSCORE_ENTRY_THRESHOLD
      const newsAdjustment = parseFloat((effectiveThreshold - ZSCORE_ENTRY_THRESHOLD).toFixed(3))

      // ── Shared variables (used by trend, EMA reclaim, and quality filter) ──
      const hasEmaSlope = indicators.ema50Prev != null
      const hasPrevClose = indicators.prevClose != null

      const momentumOk = hasEmaSlope
        ? (indicators.ema50 ?? 0) > (indicators.ema50Prev ?? 0)
        : (hasPrevClose &&
           indicators.currentPrice > (indicators.prevClose ?? 0) * 0.999)

      const adxValue = indicators.adx ?? null
      const ema50Current = indicators.ema50 ?? null
      const ema50PrevValue = indicators.ema50Prev ?? null

      const ema50SlopeOk =
        ema50Current !== null &&
        ema50PrevValue !== null &&
        ema50Current > ema50PrevValue

      const adxOk = adxValue === null || adxValue >= 20

      const trendQualityOk = ema50SlopeOk && adxOk

      const isTrendStructure =
        indicators.currentPrice > ema50Value &&
        ema50Value > ema200Value

      const isPullbackCandidate = isTrendStructure && zScore <= 0 && momentumOk
      const isZLE05Candidate = isTrendStructure && zScore > 0 && zScore <= 0.5 && momentumOk

      // ── Setup detection ──
      const meanReversionSetup = zScore <= effectiveThreshold

      // TREND_PULLBACK: uptrend structure, z-score <= 0, momentum + quality confirmed
      const trendSetup =
        ema50Value > 0 &&
        ema200Value > 0 &&
        indicators.currentPrice > ema50Value &&
        ema50Value > ema200Value &&
        zScore <= 0 &&
        momentumOk &&
        trendQualityOk

      // TREND_ZLE05: same trend structure, z-score 0–0.5, momentum + quality confirmed
      const trendZLE05Setup =
        ema50Value > 0 &&
        ema200Value > 0 &&
        indicators.currentPrice > ema50Value &&
        ema50Value > ema200Value &&
        zScore > 0 &&
        zScore <= 0.5 &&
        momentumOk &&
        trendQualityOk

      // ── EMA RECLAIM setup ──
      // Price crosses above EMA50 from below, below fair value, with momentum confirmation
      const emaReclaimSetup =
        indicators.currentPrice > (indicators.ema50 ?? 0) &&
        (indicators.prevClose ?? indicators.currentPrice) <=
          (indicators.ema50Prev ?? indicators.ema50 ?? 0) &&
        zScore < 0 &&
        ((indicators.currentPrice - (indicators.ema50 ?? 0)) /
          (indicators.ema50 ?? 1)) > 0.002 &&
        momentumOk

      const setup_detected = isAutoEntry || meanReversionSetup || trendSetup || trendZLE05Setup || emaReclaimSetup
      if (isAutoEntry && !meanReversionSetup && !trendSetup && !trendZLE05Setup && !emaReclaimSetup) {
        console.log(`[WATCHLIST] ${symbol}: auto-entry bypassing setup gate (monitored from near-miss watchlist)`)
      }

      // Track rejected trend candidates: trend-aligned but zScore > 0.5 (price above fair value)
      const trendSetupRejected = isTrendStructure && ema50Value > 0 && ema200Value > 0 && zScore > 0.5

      // Computed signal type — used for sizing, context save, and near-miss tagging
      const signalType = meanReversionSetup
        ? 'MEAN_REVERSION'
        : trendSetup
        ? 'TREND_PULLBACK'
        : trendZLE05Setup
        ? 'TREND_ZLE05'
        : emaReclaimSetup
        ? 'EMA_RECLAIM'
        : null

      console.log({ symbol, price: indicators.currentPrice, ema50: ema50Value, ema200: ema200Value, ema50_gt_ema200: ema50Value > ema200Value, trendSetup, trendZLE05Setup, trendSetupRejected, emaReclaimSetup, trendQualityOk, ema50SlopeOk, adxOk })

      if (trendSetupRejected) {
        console.log(`[SETUP-GATE] ${symbol}: TREND_ZGT05 — trend aligned but zScore ${zScore.toFixed(3)} > 0.5, excluded (price above fair value)`)
        decisions.push({
          id: randomUUID(),
          timestamp,
          symbol,
          decision: { action: 'HOLD', symbol, quantity: 0, reasoning: `TREND_ZGT05: trend setup detected but excluded — zScore ${zScore.toFixed(3)} > 0.5 (price above fair value)`, confidence: 0 },
          indicators,
          portfolioSnapshot: { equity: account.equity, cash: account.cash, positionCount: positions.length },
          orderExecuted: false,
          error: 'TREND_ZGT05: excluded — zScore > 0.5',
        })
        continue
      }

      // Track near-miss EMA Reclaim: cross detected but distance or momentum conditions not met
      const emaReclaimNearMiss =
        indicators.currentPrice > (indicators.ema50 ?? 0) &&
        (indicators.prevClose ?? indicators.currentPrice) <=
          (indicators.ema50Prev ?? indicators.ema50 ?? 0) &&
        zScore < 0 &&
        !emaReclaimSetup

      if (emaReclaimNearMiss && !setup_detected) {
        console.log(`[SETUP-GATE] ${symbol}: EMA_RECLAIM_NEAR — cross detected but conditions not fully met (distance or momentum)`)
        decisions.push({
          id: randomUUID(),
          timestamp,
          symbol,
          decision: { action: 'HOLD', symbol, quantity: 0, reasoning: `EMA_RECLAIM_NEAR: EMA50 cross detected but conditions not met — distance or momentum insufficient, zScore=${zScore.toFixed(3)}`, confidence: 0 },
          indicators,
          portfolioSnapshot: { equity: account.equity, cash: account.cash, positionCount: positions.length },
          orderExecuted: false,
          error: 'EMA_RECLAIM_NEAR: conditions not met',
        })
        continue
      }

      // Trend candidate blocked by quality filter (flat EMA50 slope or weak ADX)
      if ((isPullbackCandidate || isZLE05Candidate) && !trendQualityOk) {
        const qualityError = `TREND_QUALITY_FAIL: adx=${adxValue !== null ? adxValue.toFixed(1) : 'null'} slope=${ema50SlopeOk ? 'ok' : 'flat'}`
        console.log(`[SETUP-GATE] ${symbol}: ${qualityError}`)
        decisions.push({
          id: randomUUID(),
          timestamp,
          symbol,
          decision: { action: 'HOLD', symbol, quantity: 0, reasoning: `${qualityError} — trend structure present but quality insufficient for entry`, confidence: 0 },
          indicators,
          portfolioSnapshot: { equity: account.equity, cash: account.cash, positionCount: positions.length },
          orderExecuted: false,
          error: qualityError,
        })
        continue
      }

      if (!setup_detected) {
        console.log(`[SETUP-GATE] ${symbol}: no setup (z-score=${zScore.toFixed(3)}, price=${indicators.currentPrice.toFixed(2)}, ema50=${ema50Value > 0 ? ema50Value.toFixed(2) : 'N/A'}) — HOLD`)
        decisions.push({
          id: randomUUID(),
          timestamp,
          symbol,
          decision: { action: 'HOLD', symbol, quantity: 0, reasoning: `Setup gate: no mean reversion setup (z-score ${zScore.toFixed(3)} > ${effectiveThreshold}) and no trend setup (price not above EMA50)`, confidence: 0 },
          indicators,
          portfolioSnapshot: { equity: account.equity, cash: account.cash, positionCount: positions.length },
          orderExecuted: false,
          error: undefined,
        })
        continue
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
      decision.symbol = symbol
      decision.action = 'HOLD'   // Claude no longer decides action — system decides via setup_detected + gates
      decision.quantity = decision.quantity ?? 0

      // Execution gates — checked AFTER Claude analysis so every symbol gets indicators +
      // learning_note + near-miss detection regardless of portfolio state
      const blockedSignalType = signalType ?? 'TREND_PULLBACK'

      if (openPositionsCount >= maxPositions) {
        decisions.push({
          id: randomUUID(),
          timestamp,
          symbol,
          decision,
          indicators: { ...indicators, would_execute: false, errors: ['max_positions'] } as unknown as TechnicalIndicators,
          portfolioSnapshot: { equity: account.equity, cash: account.cash, positionCount: positions.length },
          orderExecuted: false,
          error: `Gate: max positions (${openPositionsCount}/${maxPositions})`,
        })
        await detectNearMisses(symbol, indicators, thresholdMap, {
          wouldExecute: true,
          reason: 'max_positions',
          signalType: blockedSignalType,
        }).catch(() => {})
        continue
      }
      if (buysToday >= maxBuysPerDay) {
        decisions.push({
          id: randomUUID(),
          timestamp,
          symbol,
          decision,
          indicators: { ...indicators, would_execute: false, errors: ['max_buys'] } as unknown as TechnicalIndicators,
          portfolioSnapshot: { equity: account.equity, cash: account.cash, positionCount: positions.length },
          orderExecuted: false,
          error: `Gate: max buys per day (${buysToday}/${maxBuysPerDay})`,
        })
        await detectNearMisses(symbol, indicators, thresholdMap, {
          wouldExecute: true,
          reason: 'max_buys',
          signalType: blockedSignalType,
        }).catch(() => {})
        continue
      }

      let orderExecuted = false
      let orderId: string | undefined
      let error: string | undefined
      let queuedForRanking = false
      let buyQueueQty = 0

      // Execute order if market is open and setup was detected
      if (setup_detected) {
        if (!marketOpen) {
          error = 'Market closed — order queued but not executed'
        } else {
          try {
            const hasOpenPosition = positions.some(p => p.symbol === symbol)
            if (!hasOpenPosition) {
              // Gate 1: liquidity
              console.log(`[LIQUIDITY] ${symbol} feed: delayed_sip, prevDayVolume: ${indicators.prevDayVolume.toLocaleString()}`)
              if (!checkLiquidity(indicators.prevDayVolume)) {
                error = `Liquidity gate: prev day volume ${indicators.prevDayVolume.toLocaleString()} < 1,000,000`
                decision.action = 'HOLD'
              }
              // Gate 2: trading hours
              else if (!checkTradingHours()) {
                error = 'Trading hours gate: outside 9:45am–3:30pm ET window'
                decision.action = 'HOLD'
              }
              // Gate 3: overtrading limit (uses in-cycle counter — already checked at loop top)
              else if (buysToday >= maxBuysPerDay) {
                error = `Overtrading gate: ${buysToday} BUYs already executed today`
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
                } else {
                  // All gates passed — size position
                  const baseShares = calculateBuyQuantity(
                    indicators.currentPrice,
                    parseFloat(account.equity),
                    parseFloat(account.buying_power),
                    indicators.kalman?.signal,
                    indicators.marketRegime
                  )
                  // Confidence-based position sizing with 50% floor
                  const confidenceMultiplier = Math.max(0.50, Math.min(decision.confidence, 1.0))
                  let adjustedShares = Math.round(baseShares * confidenceMultiplier)
                  // Edge override: extreme z-score gets full size (applied last, never overwritten)
                  if (zScore <= -2.0) {
                    adjustedShares = baseShares
                  }
                  const emaReclaimMultiplier = 0.75
                  let finalShares = adjustedShares
                  if (signalType === 'EMA_RECLAIM') {
                    finalShares = Math.round(adjustedShares * emaReclaimMultiplier)
                  }
                  const qty = finalShares
                  const allGatesPassed = true  // reached this point — all gates cleared
                  const wouldExecute = setup_detected && allGatesPassed
                  console.log(`[BUY SIZING] ${symbol}: baseShares=${baseShares} | confidence=${decision.confidence.toFixed(2)} | multiplier=${confidenceMultiplier.toFixed(2)} | adjustedShares=${adjustedShares} | zScore=${zScore.toFixed(3)} | price=$${indicators.currentPrice} | regime=${indicators.marketRegime}`)
                  if (qty > 0) {
                    if (slotsAvailable <= 1) {
                      // Ranking mode — collect all candidates, execute best after loop
                      console.log(`[RANKING] ${symbol}: queued (z=${zScore.toFixed(3)}, confidence=${decision.confidence.toFixed(2)})`)
                      queuedForRanking = true
                      buyQueueQty = qty
                      error = 'Queued for ranking'
                    } else {
                      // Normal mode — execute immediately
                      decision.action = 'BUY'
                      const order = await submitOrder(symbol, qty, 'buy')
                      orderId = order.id
                      orderExecuted = true
                      decision.quantity = qty
                      openPositionsCount++
                      buysToday++

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
                        signalType,
                      })

                      // If this BUY came from the Near-Miss Watchlist, link the log entry
                      if (isAutoEntry) {
                        await markWatchlistTriggered(symbol, entryLogId).catch(() => {})
                      }
                    }
                  } else {
                    error = 'Insufficient buying power for position'
                    decision.action = 'HOLD'
                  }
                }
              }
            } else {
              error = 'Already in position'
            }
          } catch (execErr) {
            error = String(execErr)
          }
        }
      }

      // Merge learning fields + news threshold into indicators jsonb so dashboard can read them
      const indicatorsWithLearning = {
        ...indicators,
        effectiveThreshold,
        newsAdjustment,
        ...(decision.learning_note !== undefined && { learning_note: decision.learning_note }),
        ...(decision.near_miss_score !== undefined && { near_miss_score: decision.near_miss_score }),
        ...(decision.what_would_trigger !== undefined && { what_would_trigger: decision.what_would_trigger }),
      }

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
        error,
      }

      if (queuedForRanking) {
        buyQueue.push({ symbol, zScore, confidence: decision.confidence, signalType, indicators, decision, entry, qty: buyQueueQty, isAutoEntry })
      } else {
        decisions.push(entry)
      }
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

  // Ranking phase — when only 1 slot was available, pick best candidate by signal strength
  if (buyQueue.length > 0) {
    const ranked = [...buyQueue].sort((a, b) => {
      const aEdge = a.zScore <= -2.0 ? 1 : 0
      const bEdge = b.zScore <= -2.0 ? 1 : 0
      if (aEdge !== bEdge) return bEdge - aEdge
      if (a.zScore !== b.zScore) return a.zScore - b.zScore
      return b.confidence - a.confidence
    })

    const best = ranked[0]
    console.log(`[RANKING] Winner: ${best.symbol} (z=${best.zScore.toFixed(3)}, confidence=${best.confidence.toFixed(2)}) — ${ranked.length} candidates evaluated`)

    try {
      if (!marketOpen) {
        best.entry.error = 'Market closed — order queued but not executed'
        decisions.push(best.entry)
      } else {
        const order = await submitOrder(best.symbol, best.qty, 'buy')
        best.entry.orderId = order.id
        best.entry.orderExecuted = true
        best.decision.action = 'BUY'
        best.decision.quantity = best.qty
        best.entry.error = undefined
        openPositionsCount++
        buysToday++

        const stopLossPct = parseFloat(process.env.STOP_LOSS_PCT ?? '0.05')
        const stopPrice = best.indicators.currentPrice * (1 - stopLossPct)
        let stopOrderId: string | undefined
        try {
          const stopOrder = await submitStopOrder(best.symbol, best.qty, stopPrice)
          stopOrderId = stopOrder.id
        } catch (stopErr) {
          console.warn(`[RANKING] Stop order failed for ${best.symbol}:`, stopErr)
        }

        const entryLogId = randomUUID()
        await saveOpenPositionContext({
          symbol: best.symbol,
          buyTimestamp: timestamp,
          buyPrice: best.indicators.currentPrice,
          quantity: best.qty,
          indicators: best.indicators,
          claudeReasoning: best.decision.reasoning,
          patternIdsUsed: [],
          stopOrderId,
          signalType: best.signalType as 'MEAN_REVERSION' | 'TREND_PULLBACK' | 'TREND_ZLE05' | 'EMA_RECLAIM' | null,
        })

        if (best.isAutoEntry) {
          await markWatchlistTriggered(best.symbol, entryLogId).catch(() => {})
        }

        decisions.push(best.entry)
      }
    } catch (execErr) {
      best.entry.error = String(execErr)
      decisions.push(best.entry)
    }

    // Log rejected candidates as outranked near-misses
    for (const rejected of ranked.slice(1)) {
      console.log(`[RANKING] Outranked: ${rejected.symbol} (z=${rejected.zScore.toFixed(3)} vs winner z=${best.zScore.toFixed(3)})`)
      rejected.entry.error = `Outranked by ${best.symbol} (z=${best.zScore.toFixed(3)} vs z=${rejected.zScore.toFixed(3)})`
      decisions.push(rejected.entry)
      await detectNearMisses(
        rejected.symbol,
        rejected.indicators,
        thresholdMap,
        { wouldExecute: true, reason: 'outranked', signalType: rejected.signalType as 'MEAN_REVERSION' | 'TREND_PULLBACK' | 'TREND_ZLE05' | 'EMA_RECLAIM' | null }
      ).catch(() => {})
    }
  }

  // KNOWN RISK: decisions are only persisted here, after the full loop completes.
  // If the process dies mid-cycle (OOM, timeout, unhandled rejection), all entries
  // for that cycle are lost — nothing is written to agent_log. Fix requires
  // per-symbol persistence inside the loop, which changes the existing structure.
  await appendAgentLogEntries(decisions)

  return { decisions, evaluations, marketOpen, timestamp }
}
