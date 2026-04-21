// ============================================================
// ALPACA API TYPES
// ============================================================

export interface AlpacaAccount {
  id: string
  cash: string
  portfolio_value: string
  buying_power: string
  equity: string
  last_equity: string
  long_market_value: string
  short_market_value: string
  initial_margin: string
  maintenance_margin: string
  daytrade_count: number
  multiplier: string
  pattern_day_trader: boolean
  trading_blocked: boolean
  account_blocked: boolean
  status: string
}

export interface AlpacaPosition {
  asset_id: string
  symbol: string
  exchange: string
  asset_class: string
  avg_entry_price: string
  qty: string
  side: string
  market_value: string
  cost_basis: string
  unrealized_pl: string
  unrealized_plpc: string
  unrealized_intraday_pl: string
  unrealized_intraday_plpc: string
  current_price: string
  lastday_price: string
  change_today: string
}

export interface AlpacaOrder {
  id: string
  client_order_id: string
  created_at: string
  updated_at: string
  submitted_at: string
  filled_at: string | null
  symbol: string
  asset_class: string
  notional: string | null
  qty: string
  filled_qty: string
  filled_avg_price: string | null
  order_class: string
  order_type: string
  type: string
  side: string
  time_in_force: string
  limit_price: string | null
  stop_price: string | null
  status: string
}

export interface AlpacaBar {
  t: string   // timestamp ISO
  o: number   // open
  h: number   // high
  l: number   // low
  c: number   // close
  v: number   // volume
  vw: number  // volume weighted average price
  n: number   // number of trades
}

export interface AlpacaClock {
  timestamp: string
  is_open: boolean
  next_open: string
  next_close: string
}

// ============================================================
// TECHNICAL INDICATORS
// ============================================================

export type MarketRegime = 'TRENDING' | 'RANGING' | 'HIGH_VOLATILITY' | 'TRANSITION'

export interface TechnicalIndicators {
  rsi: number | null
  macd: {
    macdLine: number
    signalLine: number
    histogram: number
  } | null
  bollingerBands: {
    upper: number
    middle: number
    lower: number
    percentB: number
  } | null
  sma50: number | null
  sma200: number | null
  ema50: number | null
  ema200: number | null
  distanceToEma50Pct: number | null
  kalman: {
    stateEstimate: number   // Kalman-estimated fair price (E.P. Chan)
    forecastError: number   // e(t) = current price - state estimate
    errorStdDev: number     // Q(t) = dynamic std dev of forecast errors
    zScore: number          // e(t) / Q(t) — normalized deviation
    signal: 'MEAN_REVERSION_LONG' | 'EXIT_LONG' | 'NEUTRAL'
  } | null
  currentPrice: number
  volume: number
  prevDayVolume: number
  adx: number | null
  atr: number | null
  atrPercentile: number | null
  marketRegime: MarketRegime | null
}

// ============================================================
// CLAUDE AGENT DECISION
// ============================================================

export type AgentAction = 'BUY' | 'SELL' | 'HOLD'
export type SignalType = 'MEAN_REVERSION' | 'TREND_FOLLOWING' | 'PULLBACK_EMA50' | 'OTHER'

export interface PreFilterFlag {
  rule: 'zscore' | 'regime' | 'drawdown' | 'volatility'
  detail: string
  gap: number
}

export interface LearnContext {
  pre_filter_triggered: true
  flags: PreFilterFlag[]
  nearest_flag: PreFilterFlag
  mode: 'LEARN'
}

export interface AgentDecision {
  action: AgentAction
  symbol: string
  quantity: number
  reasoning: string
  confidence: number
  signal_type?: SignalType
  learning_note?: string
  near_miss_score?: number
  what_would_trigger?: string
}

export interface AgentLogEntry {
  id: string
  timestamp: string
  symbol: string
  decision: AgentDecision
  indicators: TechnicalIndicators
  portfolioSnapshot: {
    equity: string
    cash: string
    positionCount: number
  }
  orderExecuted: boolean
  orderId?: string
  error?: string
}

// ============================================================
// LEARNING SYSTEM TYPES
// ============================================================

export interface OpenPositionContext {
  symbol: string
  buyTimestamp: string
  buyPrice: number
  quantity: number
  indicators: TechnicalIndicators
  claudeReasoning: string
  patternIdsUsed: string[]
  stopOrderId?: string
  signalType?: 'MEAN_REVERSION' | 'TREND' | null
}

export interface TradeEvaluation {
  id: string
  symbol: string
  buyTimestamp: string
  sellTimestamp: string
  buyPrice: number
  sellPrice: number
  quantity: number
  pnlUSD: number
  pnlPct: number
  holdingDays: number
  signal_type?: 'MEAN_REVERSION' | 'TREND' | null
  buyIndicators: TechnicalIndicators
  claudePostMortem: string
  lessonsLearned: string[]
  outcome: 'profit' | 'loss' | 'breakeven'
}

export interface TradingPattern {
  id: string
  createdAt: string
  updatedAt: string
  description: string
  conditions: {
    rsiBelow?: number
    rsiAbove?: number
    macdBullish?: boolean
    macdBearish?: boolean
    priceAboveSMA50?: boolean
    priceAboveSMA200?: boolean
    bbPercentBBelow?: number
    bbPercentBAbove?: number
  }
  action: 'BUY' | 'SELL'
  sampleCount: number
  winCount: number
  avgPnLPct: number
  winRate: number
  exampleReasoning: string
}

// ============================================================
// DYNAMIC STOCK SELECTION TYPES
// ============================================================

export interface ScreenerStock {
  symbol: string
  price: number
  changePercent: number
  volume: number
}

export interface SelectionDecision {
  timestamp: string
  candidatesOffered: ScreenerStock[]
  selectedSymbols: string[]
  reasoning: string
}

export interface SelectionEvaluation {
  symbol: string
  selectedAt: string
  outcome: 'profitable' | 'loss' | 'no_trade'
  pnlPct: number
  lesson: string
}

// ============================================================
// DASHBOARD DISPLAY TYPES
// ============================================================

export interface PortfolioSummary {
  equity: number
  cash: number
  buyingPower: number
  totalPnL: number
  todayPnL: number
  totalPnLPct: number
  todayPnLPct: number
}

export interface PositionDisplay {
  symbol: string
  qty: number
  avgEntryPrice: number
  currentPrice: number
  marketValue: number
  unrealizedPnL: number
  unrealizedPnLPct: number
  changeToday: number
}

export interface NewsEvent {
  id?: string
  timestamp: string
  symbol: string | null
  scope: 'MACRO' | 'SYMBOL'
  sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL'
  impact: 'HIGH' | 'MEDIUM' | 'LOW'
  threshold_adjustment: number
  headline: string
  reasoning?: string
  expires_at?: string
  applied_to_symbols?: string[]
  created_at?: string
}

export interface NearMissEntry {
  id: string
  symbol: string
  detected_at: string
  initial_zscore: number
  gap_to_threshold: number
  initial_regime: string
  indicators_snapshot: Record<string, unknown>
  status: 'ACTIVE' | 'TRIGGERED' | 'EXPIRED' | 'CANCELLED'
  signal_type?: 'MEAN_REVERSION' | 'TREND' | null
  latest_zscore?: number
  latest_regime?: string
  news_boost_applied: number
  effective_threshold: number
  monitoring_cycles: number
  expires_at: string
  triggered_agent_log_id?: string
  cancel_reason?: string
  created_at?: string
}

// Keys: symbol tickers + '__MACRO__' | Values: adjusted z-score threshold (default -1.5)
export type ThresholdMap = Record<string, number>
