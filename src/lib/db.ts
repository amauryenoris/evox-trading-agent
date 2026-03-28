import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type {
  AgentLogEntry,
  OpenPositionContext,
  TradeEvaluation,
  TradingPattern,
  SelectionDecision,
  SelectionEvaluation,
} from './types'

function getClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY are required')
  return createClient(url, key)
}

// ============================================================
// AGENT LOG
// ============================================================

export async function insertAgentLogEntry(entry: AgentLogEntry): Promise<void> {
  const db = getClient()
  const { error } = await db.from('agent_log').insert({
    id: entry.id,
    timestamp: entry.timestamp,
    symbol: entry.symbol,
    action: entry.decision.action,
    quantity: entry.decision.quantity,
    reasoning: entry.decision.reasoning,
    confidence: entry.decision.confidence,
    indicators: entry.indicators,
    portfolio_snapshot: entry.portfolioSnapshot,
    order_id: entry.orderId ?? null,
    order_executed: entry.orderExecuted,
    error: entry.error ?? null,
  })
  if (error) throw new Error(`Failed to insert agent log: ${error.message}`)
}

export async function getAgentLog(limit = 500): Promise<AgentLogEntry[]> {
  const db = getClient()
  const { data, error } = await db
    .from('agent_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`Failed to fetch agent log: ${error.message}`)
  return (data ?? []).map((row) => ({
    id: row.id,
    timestamp: row.timestamp,
    symbol: row.symbol,
    decision: {
      action: row.action,
      symbol: row.symbol,
      quantity: row.quantity ?? 0,
      reasoning: row.reasoning ?? '',
      confidence: row.confidence ?? 0,
    },
    indicators: row.indicators ?? {
      rsi: null, macd: null, bollingerBands: null,
      sma50: null, sma200: null, currentPrice: 0, volume: 0,
    },
    portfolioSnapshot: row.portfolio_snapshot ?? { equity: '0', cash: '0', positionCount: 0 },
    orderExecuted: row.order_executed ?? false,
    orderId: row.order_id ?? undefined,
    error: row.error ?? undefined,
  }))
}

// ============================================================
// OPEN POSITION CONTEXTS
// ============================================================

export async function saveOpenPositionContext(ctx: OpenPositionContext): Promise<void> {
  const db = getClient()
  const { error } = await db.from('open_position_contexts').upsert({
    symbol: ctx.symbol,
    buy_timestamp: ctx.buyTimestamp,
    buy_price: ctx.buyPrice,
    quantity: ctx.quantity,
    indicators: ctx.indicators,
    reasoning: ctx.claudeReasoning,
    pattern_ids: ctx.patternIdsUsed,
    stop_order_id: ctx.stopOrderId ?? null,
  }, { onConflict: 'symbol' })
  if (error) throw new Error(`Failed to save position context: ${error.message}`)
}

function mapRowToOpenPositionContext(row: Record<string, unknown>): OpenPositionContext {
  return {
    symbol: row.symbol as string,
    buyTimestamp: row.buy_timestamp as string,
    buyPrice: row.buy_price as number,
    quantity: row.quantity as number,
    indicators: row.indicators as OpenPositionContext['indicators'],
    claudeReasoning: (row.reasoning as string) ?? '',
    patternIdsUsed: (row.pattern_ids as string[]) ?? [],
    stopOrderId: (row.stop_order_id as string | null) ?? undefined,
  }
}

export async function getOpenPositionContexts(): Promise<OpenPositionContext[]> {
  const db = getClient()
  const { data, error } = await db.from('open_position_contexts').select('*')
  if (error) throw new Error(`Failed to fetch position contexts: ${error.message}`)
  return (data ?? []).map(mapRowToOpenPositionContext)
}

export async function getAllOpenPositionContexts(): Promise<OpenPositionContext[]> {
  return getOpenPositionContexts()
}

export async function deleteOpenPositionContext(symbol: string): Promise<void> {
  const db = getClient()
  const { error } = await db.from('open_position_contexts').delete().eq('symbol', symbol)
  if (error) throw new Error(`Failed to delete position context: ${error.message}`)
}

// ============================================================
// TRADE EVALUATIONS
// ============================================================

export async function insertTradeEvaluation(evaluation: TradeEvaluation): Promise<void> {
  const db = getClient()
  const { error } = await db.from('trade_evaluations').insert({
    symbol: evaluation.symbol,
    buy_timestamp: evaluation.buyTimestamp,
    sell_timestamp: evaluation.sellTimestamp,
    entry_price: evaluation.buyPrice,
    exit_price: evaluation.sellPrice,
    quantity: evaluation.quantity,
    pnl_usd: evaluation.pnlUSD,
    pnl_pct: evaluation.pnlPct,
    holding_period_hours: evaluation.holdingDays * 24,
    indicators_at_buy: evaluation.buyIndicators,
    buy_reasoning: evaluation.claudePostMortem,
    outcome: evaluation.outcome,
    lessons: evaluation.lessonsLearned,
  })
  if (error) throw new Error(`Failed to insert trade evaluation: ${error.message}`)
}

export async function getTradeEvaluations(limit = 200): Promise<TradeEvaluation[]> {
  const db = getClient()
  const { data, error } = await db
    .from('trade_evaluations')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`Failed to fetch trade evaluations: ${error.message}`)
  return (data ?? []).map((row) => ({
    id: row.id,
    symbol: row.symbol,
    buyTimestamp: row.buy_timestamp ?? '',
    sellTimestamp: row.sell_timestamp ?? '',
    buyPrice: row.entry_price ?? 0,
    sellPrice: row.exit_price ?? 0,
    quantity: row.quantity ?? 0,
    pnlUSD: row.pnl_usd ?? 0,
    pnlPct: row.pnl_pct ?? 0,
    holdingDays: Math.round((row.holding_period_hours ?? 0) / 24),
    buyIndicators: row.indicators_at_buy ?? {
      rsi: null, macd: null, bollingerBands: null,
      sma50: null, sma200: null, currentPrice: 0, volume: 0,
    },
    claudePostMortem: row.buy_reasoning ?? '',
    lessonsLearned: row.lessons ?? [],
    outcome: row.outcome ?? 'breakeven',
  }))
}

// ============================================================
// PATTERN LIBRARY
// ============================================================

export async function upsertPattern(pattern: TradingPattern): Promise<void> {
  const db = getClient()
  const { error } = await db.from('pattern_library').upsert({
    id: pattern.id,
    description: pattern.description,
    conditions: pattern.conditions,
    action: pattern.action,
    sample_count: pattern.sampleCount,
    win_count: pattern.winCount,
    avg_pnl_pct: pattern.avgPnLPct,
    win_rate: pattern.winRate,
    example_reasoning: pattern.exampleReasoning,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' })
  if (error) throw new Error(`Failed to upsert pattern: ${error.message}`)
}

export async function getPatternLibrary(): Promise<TradingPattern[]> {
  const db = getClient()
  const { data, error } = await db
    .from('pattern_library')
    .select('*')
    .order('win_rate', { ascending: false })
  if (error) throw new Error(`Failed to fetch pattern library: ${error.message}`)
  return (data ?? []).map((row) => ({
    id: row.id,
    createdAt: row.updated_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? new Date().toISOString(),
    description: row.description ?? '',
    conditions: row.conditions ?? {},
    action: row.action ?? 'BUY',
    sampleCount: row.sample_count ?? 0,
    winCount: row.win_count ?? 0,
    avgPnLPct: row.avg_pnl_pct ?? 0,
    winRate: row.win_rate ?? 0,
    exampleReasoning: row.example_reasoning ?? '',
  }))
}

// ============================================================
// SELECTION HISTORY
// ============================================================

export async function insertSelectionDecision(decision: SelectionDecision): Promise<void> {
  const db = getClient()
  const { error } = await db.from('selection_history').insert({
    candidates_offered: decision.candidatesOffered,
    selected_symbols: decision.selectedSymbols,
    reasoning: decision.reasoning,
  })
  if (error) throw new Error(`Failed to insert selection decision: ${error.message}`)
}

export async function getRecentSelections(limit = 10): Promise<SelectionDecision[]> {
  const db = getClient()
  const { data, error } = await db
    .from('selection_history')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`Failed to fetch selection history: ${error.message}`)
  return (data ?? []).map((row) => ({
    timestamp: row.created_at,
    candidatesOffered: row.candidates_offered ?? [],
    selectedSymbols: row.selected_symbols ?? [],
    reasoning: row.reasoning ?? '',
  }))
}

// ============================================================
// SELECTION EVALUATIONS
// ============================================================

export async function insertSelectionEvaluation(ev: SelectionEvaluation): Promise<void> {
  const db = getClient()
  const { error } = await db.from('selection_evaluations').insert({
    symbol: ev.symbol,
    selected_at: ev.selectedAt,
    outcome: ev.outcome,
    pnl_pct: ev.pnlPct,
    lesson: ev.lesson,
  })
  if (error) throw new Error(`Failed to insert selection evaluation: ${error.message}`)
}

export async function getSelectionEvaluations(limit = 100): Promise<SelectionEvaluation[]> {
  const db = getClient()
  const { data, error } = await db
    .from('selection_evaluations')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`Failed to fetch selection evaluations: ${error.message}`)
  return (data ?? []).map((row) => ({
    symbol: row.symbol,
    selectedAt: row.selected_at ?? row.created_at,
    outcome: row.outcome ?? 'no_trade',
    pnlPct: row.pnl_pct ?? 0,
    lesson: row.lesson ?? '',
  }))
}
