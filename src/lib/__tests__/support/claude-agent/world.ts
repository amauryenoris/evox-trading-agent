import type { AlpacaAccount, AlpacaBar, AlpacaOrder, AlpacaPosition, OpenPositionContext, TechnicalIndicators } from '../../../types'

// Pinned values: the golden must not depend on repository defaults or on uncommitted flag changes.
export const PINS = {
  zOverrideEnabled: false,
  zscoreEntryThreshold: -1.3,
  maxSpreadBps: 100,
  blacklist: ['SQQQ', 'TQQQ'],
  nowIso: '2026-11-04T15:30:00.000Z',
}

export interface Quote { bid: number; ask: number; spread: number; spreadBps: number; fresh: boolean }
export interface Call { fn: string; args: Record<string, unknown> }
export type FillMode = 'full' | 'zero'

export interface WorldConfig {
  marketOpen: boolean
  account: AlpacaAccount
  positions: AlpacaPosition[]
  contexts: OpenPositionContext[]
  indicators: Record<string, TechnicalIndicators>
  watchlist: string[]
  autoEntry: string[]
  quotes: Record<string, Quote | null>
  claude: (prompt: string) => string
  risk: { allowed: boolean; reason?: string }
  fill: Record<string, FillMode>
  orderError: Record<string, string>
  earnings: Record<string, { reportDate: string; session: 'BMO' | 'AMC' | 'UNKNOWN' } | null>
  buysToday: number
  activeCooldowns: Array<{ symbol: string; exit_reason: string; cooldown_until: string }>
}

const MACRO_SYMBOLS = new Set(['SPY', 'GDX', 'XLE', 'XLK', 'VIXY'])
const MOVER_COUNT = 30
const BAR_COUNT = 60
const MS_PER_DAY = 24 * 60 * 60 * 1000

export function defaultAccount(): AlpacaAccount {
  return {
    id: 'acct-1', cash: '100000', portfolio_value: '100000', buying_power: '400000', equity: '100000',
    last_equity: '100000', long_market_value: '0', short_market_value: '0', initial_margin: '0',
    maintenance_margin: '0', daytrade_count: 0, multiplier: '4', pattern_day_trader: false,
    trading_blocked: false, account_blocked: false, status: 'ACTIVE',
  }
}

export function claudeJson(confidence: number): string {
  return JSON.stringify({
    reasoning: 'Scripted analysis: indicators consistent with the detected setup.',
    confidence,
    learning_note: 'Scripted learning note.',
    near_miss_score: 0,
    what_would_trigger: 'Scripted trigger.',
    self_flagged_disqualifying_risk: false,
  })
}

function defaults(): WorldConfig {
  return {
    marketOpen: true, account: defaultAccount(), positions: [], contexts: [], indicators: {},
    watchlist: [], autoEntry: [], quotes: {}, claude: () => claudeJson(0.6), risk: { allowed: true },
    fill: {}, orderError: {}, earnings: {}, buysToday: 0, activeCooldowns: [],
  }
}

function makeOrder(id: string, symbol: string, side: string, qty: number, status: string, filledQty: number, price: number | null): AlpacaOrder {
  const iso = PINS.nowIso
  return {
    id, client_order_id: `client-${id}`, created_at: iso, updated_at: iso, submitted_at: iso,
    filled_at: filledQty > 0 ? iso : null, symbol, asset_class: 'us_equity', notional: null, qty: String(qty),
    filled_qty: String(filledQty), filled_avg_price: filledQty > 0 && price !== null ? String(price) : null,
    order_class: 'simple', order_type: 'limit', type: 'limit', side, time_in_force: 'ioc',
    limit_price: price === null ? null : String(price), stop_price: null, status,
  }
}

function summarizeEntry(e: { symbol: string; decision: { action: string; quantity: number; reasoning: string }; orderExecuted: boolean; error?: string; indicators: unknown }) {
  const ind = e.indicators as Record<string, unknown>
  const pick = (k: string) => (ind[k] === undefined ? undefined : ind[k])
  return {
    symbol: e.symbol, action: e.decision.action, quantity: e.decision.quantity,
    reasoningPrefix: e.decision.reasoning.slice(0, 90), orderExecuted: e.orderExecuted, error: e.error ?? null,
    effectiveThreshold: pick('effectiveThreshold'), newsAdjustment: pick('newsAdjustment'),
    requestedQty: pick('requestedQty'), mrRiskFactors: pick('mrRiskFactors'), errors: pick('errors'),
  }
}

export function createWorld() {
  const calls: Call[] = []
  const barOwner = new WeakMap<object, string>()
  const orders = new Map<string, AlpacaOrder>()
  let cfg = defaults()
  let counter = { uuid: 0, order: 0 }

  const rec = (fn: string, args: Record<string, unknown> = {}) => { calls.push({ fn, args }) }

  const alpaca = {
    getAccount: async () => { rec('getAccount'); return cfg.account },
    getPositions: async () => { rec('getPositions'); return cfg.positions },
    getClock: async () => { rec('getClock'); return { timestamp: PINS.nowIso, is_open: cfg.marketOpen, next_open: PINS.nowIso, next_close: PINS.nowIso } },
    getBars: async (symbol: string) => {
      rec('getBars', { symbol })
      if (MACRO_SYMBOLS.has(symbol)) return [] as AlpacaBar[]
      const bars = Array.from({ length: BAR_COUNT }, (_, i): AlpacaBar => ({ t: `2026-10-${String(i % 28 + 1).padStart(2, '0')}T20:00:00Z`, o: 100, h: 101, l: 99, c: 100, v: 1_000_000, vw: 100, n: 1000 }))
      barOwner.set(bars, symbol)
      return bars
    },
    getQuote: async (symbol: string) => { rec('getQuote', { symbol }); return cfg.quotes[symbol] ?? null },
    submitLimitOrder: async (symbol: string, qty: number, side: string, limitPrice: number) => {
      rec('submitLimitOrder', { symbol, qty, side, limitPrice, type: 'limit' })
      if (cfg.orderError[symbol]) throw new Error(cfg.orderError[symbol])
      const id = `order-${++counter.order}`
      const isFull = (cfg.fill[symbol] ?? 'full') === 'full'
      const order = makeOrder(id, symbol, side, qty, isFull ? 'filled' : 'canceled', isFull ? qty : 0, limitPrice)
      orders.set(id, order)
      return order
    },
    submitStopOrder: async (symbol: string, qty: number, stopPrice: number) => {
      rec('submitStopOrder', { symbol, qty, stopPrice, side: 'sell', type: 'stop' })
      return makeOrder(`stop-${++counter.order}`, symbol, 'sell', qty, 'new', 0, null)
    },
    submitStopLimitOrder: async (symbol: string, qty: number, stopPrice: number, limitPrice: number) => {
      rec('submitStopLimitOrder', { symbol, qty, stopPrice, limitPrice, side: 'sell', type: 'stop_limit' })
      return makeOrder(`stoplimit-${++counter.order}`, symbol, 'sell', qty, 'new', 0, limitPrice)
    },
    cancelOrder: async (orderId: string) => { rec('cancelOrder', { orderId }) },
    getOrder: async (orderId: string) => { rec('getOrder', { orderId }); return orders.get(orderId) as AlpacaOrder },
    getOrders: async (status: string) => { rec('getOrders', { status }); return [] as AlpacaOrder[] },
    closePosition: async (symbol: string) => { rec('closePosition', { symbol, side: 'sell', type: 'market_close' }) },
    getLatestSellOrder: async (symbol: string) => { rec('getLatestSellOrder', { symbol }); return null },
    getMarketMovers: async () => { rec('getMarketMovers'); return Array.from({ length: MOVER_COUNT }, (_, i) => `MOV${i}`) },
    getMacroNews: async () => { rec('getMacroNews'); return [] },
    getNewsForSymbols: async (symbols: string[]) => { rec('getNewsForSymbols', { symbols }); return [] },
    getNextTradingDay: async (from: Date, n: number) => {
      const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()))
      for (let added = 0; added < n; ) { d.setTime(d.getTime() + MS_PER_DAY); if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) added++ }
      return d
    },
  }

  const db = {
    getAllOpenPositionContexts: async () => cfg.contexts,
    getOpenPositionContexts: async () => cfg.contexts,
    getTodayBuyExecutions: async () => cfg.buysToday,
    insertAgentLogEntry: async (e: Parameters<typeof summarizeEntry>[0]) => { rec('db.insertAgentLogEntry', summarizeEntry(e)) },
    updatePositionContext: async (symbol: string, patch: Record<string, unknown>) => { rec('db.updatePositionContext', { symbol, patch }) },
    updatePositionProtectiveStop: async (symbol: string, snapshot: unknown) => { rec('db.updatePositionProtectiveStop', { symbol, snapshot }) },
    tradeEvaluationExists: async () => false,
    insertSelectionFailure: async (row: Record<string, unknown>) => { rec('db.insertSelectionFailure', row) },
    getActiveNearMissForSymbol: async () => null,
    getAgentLog: async () => [],
    saveOpenPositionContext: async (ctx: OpenPositionContext) => { rec('db.saveOpenPositionContext', { ctx }) },
    deleteOpenPositionContext: async (symbol: string) => { rec('db.deleteOpenPositionContext', { symbol }) },
    insertTradeEvaluation: async () => {},
    getTradeEvaluations: async () => [],
    getPatternLibrary: async () => [],
    upsertPattern: async () => {},
  }

  return {
    calls, alpaca, db, rec, summarizeEntry, PINS,
    get cfg() { return cfg },
    reset(overrides: Partial<WorldConfig> = {}) { calls.length = 0; orders.clear(); counter = { uuid: 0, order: 0 }; cfg = { ...defaults(), ...overrides } },
    nextUuid: () => `uuid-${String(++counter.uuid).padStart(4, '0')}`,
    indicatorsFor: (bars: object): TechnicalIndicators => {
      const symbol = barOwner.get(bars)
      const ind = symbol ? cfg.indicators[symbol] : undefined
      if (!ind) throw new Error(`no indicators scripted for ${symbol ?? 'unknown symbol'}`)
      return ind
    },
    cooldowns: {
      upsertSymbolCooldown: async (symbol: string, reason: string, until: Date) => { rec('cooldown.upsert', { symbol, reason, until: until.toISOString() }) },
      getActiveCooldowns: async () => cfg.activeCooldowns,
      cleanExpiredCooldowns: async () => { rec('cooldown.cleanExpired') },
    },
  }
}

export type World = ReturnType<typeof createWorld>
