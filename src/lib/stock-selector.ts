import Anthropic from '@anthropic-ai/sdk'
import type {
  AlpacaAccount,
  AlpacaPosition,
  ScreenerStock,
  SelectionDecision,
  SelectionEvaluation,
  TradeEvaluation,
} from './types'
import {
  insertSelectionDecision,
  getRecentSelections,
  getSelectionEvaluations,
  insertSelectionEvaluation,
} from './db'

const SELECTION_SYSTEM_PROMPT = `You are a quantitative trader AI selecting stocks for detailed technical analysis.
You will be given a list of the most active stocks in the market today.
Your job is to select the 5-8 most promising candidates for deeper analysis.

CRITERIA:
- Prefer stocks with high volume (strong institutional interest)
- Prefer stocks with significant price movement (momentum opportunities)
- Consider portfolio diversification (avoid selecting highly correlated stocks)
- Use your past selection performance to refine your choices
- Stocks currently held should only be included if you may want to evaluate them for exit

RESPOND ONLY with valid JSON (no markdown):
{
  "selected": ["SYMBOL1", "SYMBOL2", ...],
  "reasoning": "2-3 sentences explaining your selection criteria for this cycle"
}`

export async function selectStocksForAnalysis(
  candidates: ScreenerStock[],
  account: AlpacaAccount,
  positions: AlpacaPosition[]
): Promise<string[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')

  const heldSymbols = new Set(positions.map((p) => p.symbol))
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

  const candidateLines = candidates.slice(0, 30).map((s) => {
    const change = s.changePercent >= 0 ? `+${s.changePercent.toFixed(1)}%` : `${s.changePercent.toFixed(1)}%`
    const held = heldSymbols.has(s.symbol) ? ' [CURRENTLY HELD]' : ''
    return `${s.symbol}: $${s.price.toFixed(2)} (${change}) Vol: ${(s.volume / 1e6).toFixed(1)}M${held}`
  })

  const prompt = `STOCK SELECTION REQUEST

CURRENT PORTFOLIO: ${positions.length}/5 positions open
Available cash: $${parseFloat(account.cash).toFixed(0)}
Currently held: ${positions.length > 0 ? positions.map((p) => p.symbol).join(', ') : 'none'}

TODAY'S MOST ACTIVE STOCKS (${candidates.length} candidates):
${candidateLines.join('\n')}
${learningLines.length > 0 ? '\n--- YOUR PAST SELECTION LEARNING ---\n' + learningLines.join('\n') : ''}

Select 5-8 symbols for detailed technical analysis.`

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
    candidatesOffered: candidates,
    selectedSymbols: parsed.selected,
    reasoning: parsed.reasoning,
  }
  await insertSelectionDecision(decision)

  // Only return symbols that actually exist in the candidates list
  return parsed.selected.filter((s) => candidates.some((c) => c.symbol === s))
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
