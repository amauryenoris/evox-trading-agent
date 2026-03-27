import Anthropic from '@anthropic-ai/sdk'
import type {
  AlpacaAccount,
  AlpacaPosition,
  ScreenerStock,
  SelectionDecision,
  SelectionEvaluation,
  TradeEvaluation,
} from './types'
import { getStockSnapshots } from './alpaca'
import {
  insertSelectionDecision,
  getRecentSelections,
  getSelectionEvaluations,
  insertSelectionEvaluation,
} from './db'

// Default sector watchlist — overridable via SECTOR_WATCHLIST env var
const DEFAULT_SECTOR_WATCHLIST = [
  // Big Tech
  'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'META', 'AMZN', 'TSLA',
  // Oil & Energy
  'XOM', 'CVX', 'OXY', 'COP', 'XLE',
  // Mining, Gold & Rare Earth
  'MP', 'UUUU', 'NEM', 'FCX', 'GOLD',
].join(',')

const SELECTION_SYSTEM_PROMPT = `You are a quantitative trader AI selecting stocks for detailed technical analysis.
You will receive two pools of candidates: the most active stocks from the market screener, and a curated sector watchlist.
Your job is to select 6-8 symbols that maximize both opportunity and sector diversification.

CRITERIA:
- Prefer stocks with high volume (strong institutional interest) from the screener pool
- Prefer stocks with significant price movement (momentum opportunities)
- MANDATORY: include at least 1 stock from each of these sectors in your final selection:
    * Big Tech (AAPL, MSFT, NVDA, GOOGL, META, AMZN, TSLA)
    * Oil & Energy (XOM, CVX, OXY, COP, XLE)
    * Mining / Gold / Rare Earth (MP, UUUU, NEM, FCX, GOLD)
- Use your past selection performance to refine your choices within sectors
- Avoid selecting highly correlated stocks (e.g. don't pick 3 energy stocks)
- Stocks currently held should only be included if you may want to evaluate them for exit

RESPOND ONLY with valid JSON (no markdown):
{
  "selected": ["SYMBOL1", "SYMBOL2", ...],
  "reasoning": "2-3 sentences explaining your selection including sector coverage"
}`

export async function selectStocksForAnalysis(
  candidates: ScreenerStock[],
  account: AlpacaAccount,
  positions: AlpacaPosition[]
): Promise<string[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')

  const heldSymbols = new Set(positions.map((p) => p.symbol))

  // Fetch sector watchlist snapshots and merge with screener candidates
  const sectorSymbols = (process.env.SECTOR_WATCHLIST ?? DEFAULT_SECTOR_WATCHLIST)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  const screenerSymbolSet = new Set(candidates.map((c) => c.symbol))
  const sectorOnlySymbols = sectorSymbols.filter((s) => !screenerSymbolSet.has(s))
  const sectorSnapshots = await getStockSnapshots(sectorOnlySymbols)

  // All candidates = screener (most active) + sector watchlist not already in screener
  const allCandidates: ScreenerStock[] = [...candidates, ...sectorSnapshots]

  const [selectionEvals] = await Promise.all([getSelectionEvaluations(50)])

  const learningLines: string[] = []
  if (selectionEvals.length > 0) {
    const wins = selectionEvals.filter((e) => e.outcome === 'profitable')
    const losses = selectionEvals.filter((e) => e.outcome === 'loss')
    learningLines.push(
      `PAST SELECTION PERFORMANCE: ${wins.length} profitable, ${losses.length} losses out of ${selectionEvals.length} total selections`
    )
    selectionEvals.slice(0, 8).forEach((e) => {
      const pnl = e.pnlPct >= 0 ? `+${e.pnlPct.toFixed(1)}%` : `${e.pnlPct.toFixed(1)}%`
      learningLines.push(`- ${e.symbol}: ${e.outcome.toUpperCase()} ${pnl} → ${e.lesson}`)
    })
  }

  const screenerLines = candidates.slice(0, 30).map((s) => {
    const change = s.changePercent >= 0 ? `+${s.changePercent.toFixed(1)}%` : `${s.changePercent.toFixed(1)}%`
    const held = heldSymbols.has(s.symbol) ? ' [CURRENTLY HELD]' : ''
    return `${s.symbol}: $${s.price.toFixed(2)} (${change}) Vol: ${(s.volume / 1e6).toFixed(1)}M${held}`
  })

  const sectorLines = sectorSnapshots.map((s) => {
    const change = s.changePercent >= 0 ? `+${s.changePercent.toFixed(1)}%` : `${s.changePercent.toFixed(1)}%`
    const held = heldSymbols.has(s.symbol) ? ' [CURRENTLY HELD]' : ''
    return `${s.symbol}: $${s.price.toFixed(2)} (${change})${held}`
  })

  const prompt = `STOCK SELECTION REQUEST

CURRENT PORTFOLIO: ${positions.length}/5 positions open
Available cash: $${parseFloat(account.cash).toFixed(0)}
Currently held: ${positions.length > 0 ? positions.map((p) => p.symbol).join(', ') : 'none'}

--- POOL A: MARKET SCREENER (most active by volume today) ---
${screenerLines.join('\n')}

--- POOL B: SECTOR WATCHLIST (Big Tech / Oil & Energy / Mining & Rare Earth) ---
${sectorLines.length > 0 ? sectorLines.join('\n') : '(all sector stocks already in screener pool)'}
${learningLines.length > 0 ? '\n--- YOUR PAST SELECTION LEARNING ---\n' + learningLines.join('\n') : ''}

Select 6-8 symbols for detailed technical analysis. Must include at least 1 from each sector in Pool B.`

  const client = new Anthropic({ apiKey })
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    system: SELECTION_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  })

  const content = response.content[0]
  if (content.type !== 'text') throw new Error('Unexpected Claude response type')

  const jsonText = content.text.replace(/```json\n?|\n?```/g, '').trim()
  const parsed = JSON.parse(jsonText) as { selected: string[]; reasoning: string }

  const decision: SelectionDecision = {
    timestamp: new Date().toISOString(),
    candidatesOffered: allCandidates,
    selectedSymbols: parsed.selected,
    reasoning: parsed.reasoning,
  }
  await insertSelectionDecision(decision)

  // Accept any symbol from either pool
  const allSymbolSet = new Set(allCandidates.map((c) => c.symbol))
  return parsed.selected.filter((s) => allSymbolSet.has(s))
}

export async function recordSelectionOutcome(
  symbol: string,
  evaluation: TradeEvaluation
): Promise<void> {
  try {
    const recentSelections = await getRecentSelections(20)
    const selectionRecord = recentSelections.find((s) => s.selectedSymbols.includes(symbol))

    const outcome: SelectionEvaluation['outcome'] =
      evaluation.outcome === 'profit' ? 'profitable'
      : evaluation.outcome === 'loss' ? 'loss'
      : 'no_trade'

    const lesson =
      evaluation.lessonsLearned[0] ??
      `${symbol} ${evaluation.outcome}: ${evaluation.pnlPct.toFixed(1)}%`

    await insertSelectionEvaluation({
      symbol,
      selectedAt: selectionRecord?.timestamp ?? new Date().toISOString(),
      outcome,
      pnlPct: evaluation.pnlPct,
      lesson,
    })
  } catch (err) {
    console.error(`Failed to record selection outcome for ${symbol}:`, err)
  }
}
