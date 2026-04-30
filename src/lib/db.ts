import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type {
  AgentLogEntry,
  OpenPositionContext,
  TradeEvaluation,
  TradingPattern,
  SelectionDecision,
  SelectionEvaluation,
  NewsEvent,
  NearMissEntry,
} from './types'

function getClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY are required')
  return createClient(url, key)
}

function getServiceClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
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
    indicators: (() => {
      const raw = row.indicators ?? {}
      return {
        rsi: raw.rsi ?? null,
        macd: raw.macd ?? null,
        bollingerBands: raw.bollingerBands ?? null,
        sma50: raw.sma50 ?? null,
        sma200: raw.sma200 ?? null,
        ema50: raw.ema50 ?? null,
        ema200: raw.ema200 ?? null,
        distanceToEma50Pct: raw.distanceToEma50Pct ?? null,
        currentPrice: raw.currentPrice ?? 0,
        volume: raw.volume ?? 0,
        prevDayVolume: raw.prevDayVolume ?? 0,
        adx: raw.adx ?? null,
        atr: raw.atr ?? null,
        atrPercentile: raw.atrPercentile ?? null,
        marketRegime: raw.marketRegime ?? null,
        kalman: raw.kalman ?? null,
      }
    })(),
    portfolioSnapshot: row.portfolio_snapshot ?? { equity: '0', cash: '0', positionCount: 0 },
    orderExecuted: row.order_executed ?? false,
    orderId: row.order_id ?? undefined,
    error: row.error ?? undefined,
  }))
}

export async function getAgentLogPrioritized(): Promise<AgentLogEntry[]> {
  const db = getClient()
  const [sellsResult, nonSellsResult] = await Promise.all([
    db.from('agent_log').select('*').eq('action', 'SELL').order('created_at', { ascending: false }).limit(10),
    db.from('agent_log').select('*').neq('action', 'SELL').order('created_at', { ascending: false }).limit(40),
  ])
  if (sellsResult.error) throw new Error(`Failed to fetch sells: ${sellsResult.error.message}`)
  if (nonSellsResult.error) throw new Error(`Failed to fetch non-sells: ${nonSellsResult.error.message}`)

  const mapRow = (row: Record<string, unknown>) => ({
    id: row.id as string,
    timestamp: row.timestamp as string,
    symbol: row.symbol as string,
    decision: {
      action: row.action as AgentLogEntry['decision']['action'],
      symbol: row.symbol as string,
      quantity: (row.quantity as number) ?? 0,
      reasoning: (row.reasoning as string) ?? '',
      confidence: (row.confidence as number) ?? 0,
    },
    indicators: (() => {
      const raw = (row.indicators as Record<string, unknown>) ?? {}
      return {
        rsi: raw.rsi as number | null ?? null,
        macd: raw.macd as AgentLogEntry['indicators']['macd'] ?? null,
        bollingerBands: raw.bollingerBands as AgentLogEntry['indicators']['bollingerBands'] ?? null,
        sma50: raw.sma50 as number | null ?? null,
        sma200: raw.sma200 as number | null ?? null,
        ema50: raw.ema50 as number | null ?? null,
        ema200: raw.ema200 as number | null ?? null,
        distanceToEma50Pct: raw.distanceToEma50Pct as number | null ?? null,
        currentPrice: (raw.currentPrice as number) ?? 0,
        volume: (raw.volume as number) ?? 0,
        prevDayVolume: (raw.prevDayVolume as number) ?? 0,
        adx: raw.adx as number | null ?? null,
        atr: raw.atr as number | null ?? null,
        atrPercentile: raw.atrPercentile as number | null ?? null,
        marketRegime: raw.marketRegime as import('./types').MarketRegime | null ?? null,
        kalman: raw.kalman as AgentLogEntry['indicators']['kalman'] ?? null,
      }
    })(),
    portfolioSnapshot: (row.portfolio_snapshot as AgentLogEntry['portfolioSnapshot']) ?? { equity: '0', cash: '0', positionCount: 0 },
    orderExecuted: (row.order_executed as boolean) ?? false,
    orderId: (row.order_id as string | null) ?? undefined,
    error: (row.error as string | null) ?? undefined,
  })

  const combined = [
    ...(sellsResult.data ?? []).map(mapRow),
    ...(nonSellsResult.data ?? []).map(mapRow),
  ]
  combined.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  return combined
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
    signal_type: ctx.signalType ?? null,
    high_since_entry: ctx.highSinceEntry ?? null,
    trailing_stop: ctx.trailingStop ?? null,
    trailing_activated: ctx.trailingActivated ?? false,
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
    signalType: (row.signal_type as 'MEAN_REVERSION' | 'TREND' | 'TREND_PULLBACK' | 'TREND_ZLE05' | null) ?? null,
    highSinceEntry: (row.high_since_entry as number | null) ?? null,
    trailingStop: (row.trailing_stop as number | null) ?? null,
    trailingActivated: (row.trailing_activated as boolean) ?? false,
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

export async function updatePositionContext(
  symbol: string,
  updates: Partial<OpenPositionContext>
): Promise<void> {
  const db = getClient()
  const { error } = await db.from('open_position_contexts')
    .update({
      high_since_entry:   updates.highSinceEntry,
      trailing_stop:      updates.trailingStop,
      trailing_activated: updates.trailingActivated,
    })
    .eq('symbol', symbol)
  if (error) throw new Error(`Failed to update position context for ${symbol}: ${error.message}`)
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

export async function getTradeEvaluations(limit = 200, startDate?: string): Promise<TradeEvaluation[]> {
  const db = getClient()
  let query = db
    .from('trade_evaluations')
    .select('*')
    .order('sell_timestamp', { ascending: false })
    .limit(limit)
  if (startDate) {
    query = query.gte('sell_timestamp', `${startDate}T00:00:00Z`)
  }
  const { data, error } = await query
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
    buyIndicators: (() => {
      const raw = row.indicators_at_buy ?? {}
      return {
        rsi: raw.rsi ?? null,
        macd: raw.macd ?? null,
        bollingerBands: raw.bollingerBands ?? null,
        sma50: raw.sma50 ?? null,
        sma200: raw.sma200 ?? null,
        ema50: raw.ema50 ?? null,
        ema200: raw.ema200 ?? null,
        distanceToEma50Pct: raw.distanceToEma50Pct ?? null,
        currentPrice: raw.currentPrice ?? 0,
        volume: raw.volume ?? 0,
        prevDayVolume: raw.prevDayVolume ?? 0,
        adx: raw.adx ?? null,
        atr: raw.atr ?? null,
        atrPercentile: raw.atrPercentile ?? null,
        marketRegime: raw.marketRegime ?? null,
        kalman: raw.indicators_at_buy?.kalman ?? raw.kalman ?? null,
      }
    })(),
    signal_type: (row.signal_type as 'MEAN_REVERSION' | 'TREND' | null) ?? null,
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

// ============================================================
// TODAY'S BUY EXECUTIONS — for overtrading gate
// ============================================================

export async function getTodayBuyExecutions(): Promise<number> {
  const db = getClient()
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString()

  const { count, error } = await db
    .from('agent_log')
    .select('*', { count: 'exact', head: true })
    .eq('action', 'BUY')
    .eq('order_executed', true)
    .gte('timestamp', todayStart)
    .lt('timestamp', todayEnd)

  if (error) throw new Error(`Failed to count today BUYs: ${error.message}`)
  return count ?? 0
}

// ============================================================
// WEEKLY REPORTS
// ============================================================

export interface WeeklyReportSummary {
  equityStart: number
  equityEnd: number
  pnlUSD: number
  pnlPct: number
  totalCycles: number
  buyDecisions: number
  sellDecisions: number
  holdDecisions: number
  tradesExecuted: number
  winRate: number
  avgWinPct: number
  avgLossPct: number
  profitFactor: number
}

export interface WeeklyReportRecord {
  id: string
  createdAt: string
  weekStart: string
  weekEnd: string
  storagePath: string
  summary: WeeklyReportSummary
}

export async function insertWeeklyReport(
  record: Omit<WeeklyReportRecord, 'id' | 'createdAt'>
): Promise<WeeklyReportRecord> {
  const db = getServiceClient()
  const { data, error } = await db
    .from('weekly_reports')
    .insert({
      week_start: record.weekStart,
      week_end: record.weekEnd,
      storage_path: record.storagePath,
      summary: record.summary,
    })
    .select()
    .single()
  if (error) throw new Error(`Failed to insert weekly report: ${error.message}`)
  return {
    id: data.id,
    createdAt: data.created_at,
    weekStart: data.week_start,
    weekEnd: data.week_end,
    storagePath: data.storage_path,
    summary: data.summary,
  }
}

export async function getWeeklyReports(limit = 20): Promise<WeeklyReportRecord[]> {
  const db = getClient()
  const { data, error } = await db
    .from('weekly_reports')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`Failed to fetch weekly reports: ${error.message}`)
  return (data ?? []).map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    weekStart: row.week_start,
    weekEnd: row.week_end,
    storagePath: row.storage_path,
    summary: row.summary ?? {},
  }))
}

export async function getWeeklyReportById(id: string): Promise<WeeklyReportRecord | null> {
  const db = getClient()
  const { data, error } = await db
    .from('weekly_reports')
    .select('*')
    .eq('id', id)
    .single()
  if (error) return null
  if (!data) return null
  return {
    id: data.id,
    createdAt: data.created_at,
    weekStart: data.week_start,
    weekEnd: data.week_end,
    storagePath: data.storage_path,
    summary: data.summary ?? {},
  }
}

// ── news_events ──────────────────────────────────────────────────────────────

export async function saveNewsEvent(
  event: Omit<NewsEvent, 'id' | 'created_at'>
): Promise<void> {
  const db = getClient()
  const { error } = await db.from('news_events').insert(event)
  if (error) throw new Error(`Failed to save news event: ${error.message}`)
}

export async function getActiveNewsEvents(symbols: string[]): Promise<NewsEvent[]> {
  const db = getClient()
  const now = new Date().toISOString()
  const { data, error } = await db
    .from('news_events')
    .select('*')
    .gt('expires_at', now)
    .or(`symbol.in.(${symbols.join(',')}),scope.eq.MACRO`)
  if (error) throw new Error(`Failed to fetch active news events: ${error.message}`)
  return (data ?? []) as NewsEvent[]
}

// ── near_miss_watchlist ───────────────────────────────────────────────────────

export async function insertNearMiss(
  entry: Omit<NearMissEntry, 'id' | 'created_at'>
): Promise<void> {
  const db = getClient()
  const { error } = await db.from('near_miss_watchlist').insert(entry)
  if (error) throw new Error(`Failed to insert near miss: ${error.message}`)
}

export async function getActiveNearMisses(): Promise<NearMissEntry[]> {
  const db = getClient()
  const now = new Date().toISOString()
  const { data, error } = await db
    .from('near_miss_watchlist')
    .select('*')
    .eq('status', 'ACTIVE')
    .gt('expires_at', now)
  if (error) throw new Error(`Failed to fetch active near misses: ${error.message}`)
  return (data ?? []) as NearMissEntry[]
}

export async function updateNearMiss(
  id: string,
  updates: Partial<Omit<NearMissEntry, 'id' | 'created_at'>>
): Promise<void> {
  const db = getClient()
  const { error } = await db.from('near_miss_watchlist').update(updates).eq('id', id)
  if (error) throw new Error(`Failed to update near miss ${id}: ${error.message}`)
}

export async function getActiveNearMissForSymbol(
  symbol: string
): Promise<NearMissEntry | null> {
  const db = getClient()
  const { data, error } = await db
    .from('near_miss_watchlist')
    .select('*')
    .eq('symbol', symbol)
    .eq('status', 'ACTIVE')
    .maybeSingle()
  if (error) throw new Error(`Failed to fetch near miss for ${symbol}: ${error.message}`)
  return data as NearMissEntry | null
}

// ── weekly report stats ───────────────────────────────────────────────────────

export async function getWeeklyNewsStats(
  weekStart: string,
  weekEnd: string
): Promise<{
  total: number
  macro: number
  symbol: number
  bullishBoosts: Array<{ symbol: string | null; adjustment: number }>
  bearishPenalties: Array<{ symbol: string | null; adjustment: number }>
  macroAdjustment: number
}> {
  const db = getClient()
  const { data, error } = await db
    .from('news_events')
    .select('*')
    .gte('created_at', weekStart)
    .lte('created_at', weekEnd)
  if (error) throw new Error(`Failed to fetch weekly news stats: ${error.message}`)
  const events = (data ?? []) as NewsEvent[]

  const macro = events.filter((e) => e.scope === 'MACRO').length
  const symbol = events.filter((e) => e.scope === 'SYMBOL').length
  const bullishBoosts = events
    .filter((e) => e.threshold_adjustment < 0)
    .map((e) => ({ symbol: e.symbol, adjustment: e.threshold_adjustment }))
  const bearishPenalties = events
    .filter((e) => e.threshold_adjustment > 0)
    .map((e) => ({ symbol: e.symbol, adjustment: e.threshold_adjustment }))
  const macroAdjustment = events
    .filter((e) => e.scope === 'MACRO')
    .reduce((sum, e) => sum + e.threshold_adjustment, 0)

  return { total: events.length, macro, symbol, bullishBoosts, bearishPenalties, macroAdjustment }
}

export async function getWeeklyWatchlistStats(
  weekStart: string,
  weekEnd: string
): Promise<{
  activeEndOfWeek: number
  newThisWeek: number
  triggered: number
  expired: number
  cancelled: number
  activeEntries: NearMissEntry[]
  triggeredEntries: NearMissEntry[]
}> {
  const db = getClient()
  const { data, error } = await db
    .from('near_miss_watchlist')
    .select('*')
    .gte('detected_at', weekStart)
    .lte('detected_at', weekEnd)
  if (error) throw new Error(`Failed to fetch weekly watchlist stats: ${error.message}`)
  const entries = (data ?? []) as NearMissEntry[]

  const { data: activeData } = await db
    .from('near_miss_watchlist')
    .select('*')
    .eq('status', 'ACTIVE')
  const activeEndOfWeek = (activeData ?? []).length

  return {
    activeEndOfWeek,
    newThisWeek: entries.length,
    triggered: entries.filter((e) => e.status === 'TRIGGERED').length,
    expired: entries.filter((e) => e.status === 'EXPIRED').length,
    cancelled: entries.filter((e) => e.status === 'CANCELLED').length,
    activeEntries: (activeData ?? []) as NearMissEntry[],
    triggeredEntries: entries.filter((e) => e.status === 'TRIGGERED'),
  }
}

export async function createStorageSignedUrl(
  storagePath: string,
  expiresInSeconds = 3600
): Promise<string> {
  const db = getServiceClient()
  const { data, error } = await db.storage
    .from('weekly-reports')
    .createSignedUrl(storagePath, expiresInSeconds)
  if (error) throw new Error(`Failed to create signed URL: ${error.message}`)
  return data.signedUrl
}
