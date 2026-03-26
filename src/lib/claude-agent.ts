import Anthropic from '@anthropic-ai/sdk'
import { randomUUID } from 'crypto'
import {
  getAccount,
  getPositions,
  getClock,
  getBars,
  submitOrder,
  closePosition,
  getLatestSellOrder,
  getMarketMovers,
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
import { selectStocksForAnalysis, recordSelectionOutcome } from './stock-selector'
import type {
  AgentDecision,
  AgentLogEntry,
  AlpacaAccount,
  AlpacaPosition,
  TechnicalIndicators,
  TradeEvaluation,
} from './types'

// ============================================================
// SYSTEM PROMPT (static — defines Claude's role)
// ============================================================

const SYSTEM_PROMPT = `You are an expert quantitative trader AI operating in a paper trading simulation for US stocks.
You analyze technical indicators and your own historical performance to make precise trading decisions.

STRICT RULES:
- Respond ONLY with valid JSON matching the schema below. No markdown, no explanation outside JSON.
- Never recommend BUY if: maximum positions (5) are already open, or insufficient buying power.
- Never recommend SELL if: no position currently exists in that symbol.
- Only recommend BUY or SELL if confidence >= 0.65. Otherwise return HOLD.
- Consider your own learning history seriously — past losses in similar conditions should lower confidence.
- Past wins in similar conditions should increase confidence, not guarantee action.

RESPONSE SCHEMA (strict JSON):
{
  "action": "BUY" | "SELL" | "HOLD",
  "symbol": "string",
  "quantity": 0,
  "reasoning": "2-4 sentences explaining the decision based on indicators and learning history",
  "confidence": 0.0
}`

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

// ============================================================
// BUILD ENRICHED PROMPT PER SYMBOL
// ============================================================

async function buildEnrichedPrompt(
  symbol: string,
  indicators: TechnicalIndicators,
  account: AlpacaAccount,
  positions: AlpacaPosition[],
  learningContext: string
): Promise<string> {
  const equity = parseFloat(account.equity)
  const maxPositionValue = equity * parseFloat(process.env.MAX_POSITION_SIZE ?? '0.10')
  const currentPosition = positions.find((p) => p.symbol === symbol)

  return `ANALYSIS REQUEST: ${symbol}

--- MARKET DATA ---
Current Price: $${indicators.currentPrice.toFixed(2)}
Volume: ${indicators.volume.toLocaleString()}

--- TECHNICAL INDICATORS ---
RSI(14): ${indicators.rsi?.toFixed(2) ?? 'N/A'} ${rsiLabel(indicators.rsi)}
MACD: line=${indicators.macd?.macdLine.toFixed(4) ?? 'N/A'}, signal=${indicators.macd?.signalLine.toFixed(4) ?? 'N/A'}, histogram=${indicators.macd?.histogram.toFixed(4) ?? 'N/A'} ${macdLabel(indicators.macd)}
Bollinger Bands: upper=$${indicators.bollingerBands?.upper.toFixed(2) ?? 'N/A'}, middle=$${indicators.bollingerBands?.middle.toFixed(2) ?? 'N/A'}, lower=$${indicators.bollingerBands?.lower.toFixed(2) ?? 'N/A'}, %B=${indicators.bollingerBands?.percentB.toFixed(3) ?? 'N/A'} ${bbLabel(indicators.bollingerBands)}
SMA50: ${smaLabel(indicators.currentPrice, indicators.sma50, 50)}
SMA200: ${smaLabel(indicators.currentPrice, indicators.sma200, 200)}

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

Analyze ${symbol} and provide your trading decision as JSON.`
}

// ============================================================
// POSITION SIZING
// ============================================================

function calculateBuyQuantity(
  currentPrice: number,
  portfolioEquity: number,
  availableCash: number
): number {
  const maxPositionValue = portfolioEquity * parseFloat(process.env.MAX_POSITION_SIZE ?? '0.10')
  const affordable = Math.min(maxPositionValue, availableCash * 0.95)
  return Math.max(0, Math.floor(affordable / currentPrice))
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
    watchlist = (process.env.TRADING_WATCHLIST ?? 'AAPL,MSFT,NVDA,SPY,QQQ')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  }

  const marketOpen = clock.is_open

  // 3. Evaluate closed positions (learning loop)
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

  // 4. Analysis cycle for each symbol
  const decisions: AgentLogEntry[] = []

  for (const symbol of watchlist) {
    try {
      // Fetch historical bars
      const bars = await getBars(symbol, '1Day', 260, 250)
      if (bars.length < 30) {
        console.warn(`Not enough bars for ${symbol}, skipping`)
        continue
      }

      const indicators = calculateAllIndicators(bars)

      // Build learning context (same for all symbols in this cycle — cached reads)
      const learningContext = await buildLearningContext(indicators)

      const userPrompt = await buildEnrichedPrompt(
        symbol,
        indicators,
        account,
        positions,
        learningContext
      )

      // Call Claude
      const response = await client.messages.create({
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

      // Execute order if market is open and decision is actionable
      if (decision.action !== 'HOLD' && decision.confidence >= 0.65) {
        if (!marketOpen) {
          error = 'Market closed — order queued but not executed'
        } else {
          try {
            if (decision.action === 'BUY') {
              const qty = calculateBuyQuantity(
                indicators.currentPrice,
                parseFloat(account.equity),
                parseFloat(account.buying_power)
              )
              if (qty > 0) {
                const order = await submitOrder(symbol, qty, 'buy')
                orderId = order.id
                orderExecuted = true
                decision.quantity = qty

                // Save buy context for future learning
                await saveOpenPositionContext({
                  symbol,
                  buyTimestamp: timestamp,
                  buyPrice: indicators.currentPrice,
                  quantity: qty,
                  indicators,
                  claudeReasoning: decision.reasoning,
                  patternIdsUsed: [],
                })
              } else {
                error = 'Insufficient buying power for position'
              }
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

      const entry: AgentLogEntry = {
        id: randomUUID(),
        timestamp,
        symbol,
        decision,
        indicators,
        portfolioSnapshot: {
          equity: account.equity,
          cash: account.cash,
          positionCount: positions.length,
        },
        orderExecuted,
        orderId,
        error,
      }

      decisions.push(entry)
    } catch (err) {
      console.error(`Error analyzing ${symbol}:`, err)
      decisions.push({
        id: randomUUID(),
        timestamp,
        symbol,
        decision: { action: 'HOLD', symbol, quantity: 0, reasoning: 'Analysis failed', confidence: 0 },
        indicators: { rsi: null, macd: null, bollingerBands: null, sma50: null, sma200: null, currentPrice: 0, volume: 0 },
        portfolioSnapshot: { equity: account.equity, cash: account.cash, positionCount: positions.length },
        orderExecuted: false,
        error: String(err),
      })
    }
  }

  await appendAgentLogEntries(decisions)

  return { decisions, evaluations, marketOpen, timestamp }
}
