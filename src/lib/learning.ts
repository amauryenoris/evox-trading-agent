import Anthropic from '@anthropic-ai/sdk'
import type {
  AlpacaPosition,
  OpenPositionContext,
  TechnicalIndicators,
  TradeEvaluation,
  TradingPattern,
} from './types'
import {
  saveOpenPositionContext as dbSaveCtx,
  getOpenPositionContexts,
  deleteOpenPositionContext,
  insertTradeEvaluation,
  getTradeEvaluations,
  getPatternLibrary,
  upsertPattern,
} from './db'

// ============================================================
// OPEN POSITION CONTEXT
// ============================================================

export async function saveOpenPositionContext(ctx: OpenPositionContext): Promise<void> {
  await dbSaveCtx(ctx)
}

export async function readOpenPositionContexts(): Promise<OpenPositionContext[]> {
  return getOpenPositionContexts()
}

export async function removeOpenPositionContext(symbol: string): Promise<void> {
  await deleteOpenPositionContext(symbol)
}

// ============================================================
// DETECT CLOSED POSITIONS
// ============================================================

export async function detectClosedPositions(
  currentPositions: AlpacaPosition[]
): Promise<OpenPositionContext[]> {
  const saved = await getOpenPositionContexts()
  if (saved.length === 0) return []
  const currentSymbols = new Set(currentPositions.map((p) => p.symbol))
  return saved.filter((ctx) => !currentSymbols.has(ctx.symbol))
}

// ============================================================
// TRADE EVALUATIONS
// ============================================================

export async function readTradeEvaluations(): Promise<TradeEvaluation[]> {
  return getTradeEvaluations()
}

export async function evaluateClosedTrade(
  closedCtx: OpenPositionContext,
  sellPrice: number,
  sellTimestamp: string
): Promise<TradeEvaluation> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')

  const pnlUSD = (sellPrice - closedCtx.buyPrice) * closedCtx.quantity
  const pnlPct = ((sellPrice - closedCtx.buyPrice) / closedCtx.buyPrice) * 100
  const holdingDays = Math.round(
    (new Date(sellTimestamp).getTime() - new Date(closedCtx.buyTimestamp).getTime()) /
      (1000 * 60 * 60 * 24)
  )
  const outcome: TradeEvaluation['outcome'] =
    pnlPct > 0.1 ? 'profit' : pnlPct < -0.1 ? 'loss' : 'breakeven'

  const ind = closedCtx.indicators

  const postMortemPrompt = `You are a quantitative trading AI performing a post-mortem analysis of a completed trade.

TRADE SUMMARY:
- Symbol: ${closedCtx.symbol}
- BUY: ${closedCtx.buyTimestamp} at $${closedCtx.buyPrice.toFixed(2)}
- SELL: ${sellTimestamp} at $${sellPrice.toFixed(2)}
- Holding period: ${holdingDays} days
- P&L: $${pnlUSD.toFixed(2)} (${pnlPct.toFixed(2)}%) → ${outcome.toUpperCase()}
- Quantity: ${closedCtx.quantity} shares

INDICATORS AT TIME OF BUY:
- RSI(14): ${ind.rsi?.toFixed(2) ?? 'N/A'}
- MACD: line=${ind.macd?.macdLine.toFixed(4) ?? 'N/A'}, signal=${ind.macd?.signalLine.toFixed(4) ?? 'N/A'}, histogram=${ind.macd?.histogram.toFixed(4) ?? 'N/A'}
- Bollinger %B: ${ind.bollingerBands?.percentB.toFixed(3) ?? 'N/A'}
- Price vs SMA50: ${ind.sma50 ? (ind.currentPrice > ind.sma50 ? 'above' : 'below') : 'N/A'}
- Price vs SMA200: ${ind.sma200 ? (ind.currentPrice > ind.sma200 ? 'above' : 'below') : 'N/A'}

ORIGINAL BUY REASONING:
"${closedCtx.claudeReasoning}"

TASK: Analyze this trade and respond ONLY with valid JSON (no markdown):
{
  "postMortem": "2-4 sentence analysis of why this trade succeeded or failed",
  "lessonsLearned": ["lesson 1", "lesson 2", "lesson 3"],
  "patternDescription": "1 sentence describing the indicator pattern at entry",
  "patternConditions": {
    "rsiBelow": number or null,
    "rsiAbove": number or null,
    "macdBullish": boolean or null,
    "macdBearish": boolean or null,
    "priceAboveSMA50": boolean or null,
    "priceAboveSMA200": boolean or null,
    "bbPercentBBelow": number or null,
    "bbPercentBAbove": number or null
  }
}`

  const client = new Anthropic({ apiKey })
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{ role: 'user', content: postMortemPrompt }],
  })

  const content = response.content[0]
  if (content.type !== 'text') throw new Error('Unexpected Claude response type')
  const jsonText = content.text.replace(/```json\n?|\n?```/g, '').trim()
  const parsed = JSON.parse(jsonText) as {
    postMortem: string
    lessonsLearned: string[]
    patternDescription: string
    patternConditions: TradingPattern['conditions']
  }

  const evaluation: TradeEvaluation = {
    id: `eval_${Date.now()}_${closedCtx.symbol}`,
    symbol: closedCtx.symbol,
    buyTimestamp: closedCtx.buyTimestamp,
    sellTimestamp,
    buyPrice: closedCtx.buyPrice,
    sellPrice,
    quantity: closedCtx.quantity,
    pnlUSD,
    pnlPct,
    holdingDays,
    buyIndicators: closedCtx.indicators,
    claudePostMortem: parsed.postMortem,
    lessonsLearned: parsed.lessonsLearned,
    outcome,
    signal_type: closedCtx.signalType ?? null,
  }

  await insertTradeEvaluation(evaluation)
  await updatePatternLibrary(evaluation, parsed.patternDescription, parsed.patternConditions)

  return evaluation
}

// ============================================================
// PATTERN LIBRARY
// ============================================================

export async function readPatternLibrary(): Promise<TradingPattern[]> {
  return getPatternLibrary()
}

export async function updatePatternLibrary(
  evaluation: TradeEvaluation,
  patternDescription: string,
  patternConditions: TradingPattern['conditions']
): Promise<void> {
  const library = await getPatternLibrary()
  const action: 'BUY' | 'SELL' = 'BUY'
  const isWin = evaluation.outcome === 'profit'

  const existing = library.find(
    (p) => p.description === patternDescription && p.action === action
  )

  const now = new Date().toISOString()
  let patternToSave: TradingPattern

  if (existing) {
    existing.sampleCount += 1
    if (isWin) existing.winCount += 1
    existing.winRate = existing.winCount / existing.sampleCount
    existing.avgPnLPct =
      (existing.avgPnLPct * (existing.sampleCount - 1) + evaluation.pnlPct) / existing.sampleCount
    existing.updatedAt = now
    if (isWin && evaluation.pnlPct > 2) {
      existing.exampleReasoning = evaluation.buyIndicators
        ? `RSI: ${evaluation.buyIndicators.rsi?.toFixed(1)}, MACD hist: ${evaluation.buyIndicators.macd?.histogram.toFixed(4)}, %B: ${evaluation.buyIndicators.bollingerBands?.percentB.toFixed(2)}`
        : existing.exampleReasoning
    }
    patternToSave = existing
  } else {
    patternToSave = {
      id: `pat_${Date.now()}_${evaluation.symbol}`,
      createdAt: now,
      updatedAt: now,
      description: patternDescription,
      conditions: patternConditions,
      action,
      sampleCount: 1,
      winCount: isWin ? 1 : 0,
      avgPnLPct: evaluation.pnlPct,
      winRate: isWin ? 1 : 0,
      exampleReasoning: evaluation.claudePostMortem,
    }
  }

  await upsertPattern(patternToSave)
}

// ============================================================
// GET RELEVANT PATTERNS
// ============================================================

function matchesConditions(pattern: TradingPattern, ind: TechnicalIndicators): boolean {
  const c = pattern.conditions
  if (c.rsiBelow !== undefined && (ind.rsi === null || ind.rsi >= c.rsiBelow)) return false
  if (c.rsiAbove !== undefined && (ind.rsi === null || ind.rsi <= c.rsiAbove)) return false
  if (c.macdBullish === true && (ind.macd === null || ind.macd.histogram <= 0)) return false
  if (c.macdBearish === true && (ind.macd === null || ind.macd.histogram >= 0)) return false
  if (c.priceAboveSMA50 === true && (ind.sma50 === null || ind.currentPrice <= ind.sma50)) return false
  if (c.priceAboveSMA50 === false && (ind.sma50 === null || ind.currentPrice >= ind.sma50)) return false
  if (c.priceAboveSMA200 === true && (ind.sma200 === null || ind.currentPrice <= ind.sma200)) return false
  if (c.priceAboveSMA200 === false && (ind.sma200 === null || ind.currentPrice >= ind.sma200)) return false
  if (c.bbPercentBBelow !== undefined && (ind.bollingerBands === null || ind.bollingerBands.percentB >= c.bbPercentBBelow)) return false
  if (c.bbPercentBAbove !== undefined && (ind.bollingerBands === null || ind.bollingerBands.percentB <= c.bbPercentBAbove)) return false
  return true
}

export async function getRelevantPatterns(
  indicators: TechnicalIndicators,
  limit = 5
): Promise<TradingPattern[]> {
  const library = await getPatternLibrary()
  const matching = library.filter((p) => matchesConditions(p, indicators))
  const topGeneral = library.filter((p) => !matching.includes(p)).slice(0, limit - matching.length)
  return [...matching, ...topGeneral].slice(0, limit)
}

// ============================================================
// BUILD LEARNING CONTEXT STRING
// ============================================================

export async function buildLearningContext(indicators: TechnicalIndicators): Promise<string> {
  const [patterns, evaluations] = await Promise.all([
    getRelevantPatterns(indicators, 5),
    getTradeEvaluations(200),
  ])

  const lines: string[] = []

  if (patterns.length > 0) {
    lines.push('PATTERNS WITH BEST PERFORMANCE (similar to current conditions):')
    patterns.forEach((p, i) => {
      const winRatePct = (p.winRate * 100).toFixed(0)
      const avgPnL = p.avgPnLPct >= 0 ? `+${p.avgPnLPct.toFixed(1)}%` : `${p.avgPnLPct.toFixed(1)}%`
      lines.push(
        `${i + 1}. "${p.description}" → ${p.action} → Win rate: ${winRatePct}% | Avg P&L: ${avgPnL} | ${p.sampleCount} trades`
      )
    })
  }

  const recentEvals = evaluations.slice(0, 5)
  if (recentEvals.length > 0) {
    lines.push('')
    lines.push('RECENT TRADE LESSONS (from your own operations):')
    recentEvals.forEach((e) => {
      const pnl = e.pnlPct >= 0 ? `+${e.pnlPct.toFixed(1)}%` : `${e.pnlPct.toFixed(1)}%`
      lines.push(`- ${e.symbol} (${e.buyTimestamp.split('T')[0]}): ${e.outcome.toUpperCase()} ${pnl}`)
      e.lessonsLearned.slice(0, 2).forEach((lesson) => lines.push(`  → ${lesson}`))
    })
  }

  const allLessons = evaluations.flatMap((e) => e.lessonsLearned)
  if (allLessons.length >= 5) {
    lines.push('')
    lines.push(`GENERAL LESSONS (from ${evaluations.length} completed trades):`)
    const uniqueLessons = [...new Set(allLessons)].slice(-5)
    uniqueLessons.forEach((l, i) => lines.push(`${i + 1}. ${l}`))
  }

  return lines.length > 0 ? lines.join('\n') : 'No trading history yet — this is your first analysis cycle.'
}
