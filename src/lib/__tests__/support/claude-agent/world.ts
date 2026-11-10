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
export interface SellOrderScript { id: string; filledAvgPrice: string | null; filledAt: string | null }

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
  sellOrders: Record<string, SellOrderScript>
  evaluatedTrades: string[]
  openOrders: AlpacaOrder[]
  filledOrders: AlpacaOrder[]
  cancelErrors: Record<string, string>
  stopErrors: Record<string, string>
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
    sellOrders: {}, evaluatedTrades: [], openOrders: [], filledOrders: [], cancelErrors: {}, stopErrors: {},
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

export interface Prompt { system: string; user: string }

interface State {
  cfg: WorldConfig
  calls: Call[]
  prompts: Prompt[]
  orders: Map<string, AlpacaOrder>
  barOwner: WeakMap<object, string>
  counter: { uuid: number; order: number }
}

interface Ctx { s: State; rec: (fn: string, args?: Record<string, unknown>) => void }

function makeCtx(): Ctx {
  const s: State = { cfg: defaults(), calls: [], prompts: [], orders: new Map(), barOwner: new WeakMap(), counter: { uuid: 0, order: 0 } }
  return { s, rec: (fn, args = {}) => { s.calls.push({ fn, args }) } }
}

function makeBars(): AlpacaBar[] {
  return Array.from({ length: BAR_COUNT }, (_, i): AlpacaBar => ({ t: `2026-10-${String(i % 28 + 1).padStart(2, '0')}T20:00:00Z`, o: 100, h: 101, l: 99, c: 100, v: 1_000_000, vw: 100, n: 1000 }))
}

function nextTradingDay(from: Date, n: number): Date {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()))
  for (let added = 0; added < n; ) { d.setTime(d.getTime() + MS_PER_DAY); if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) added++ }
  return d
}

function makeMarketApi({ s, rec }: Ctx) {
  return {
    getAccount: async () => { rec('getAccount'); return s.cfg.account },
    getPositions: async () => { rec('getPositions'); return s.cfg.positions },
    getClock: async () => { rec('getClock'); return { timestamp: PINS.nowIso, is_open: s.cfg.marketOpen, next_open: PINS.nowIso, next_close: PINS.nowIso } },
    getBars: async (symbol: string) => {
      rec('getBars', { symbol })
      if (MACRO_SYMBOLS.has(symbol)) return [] as AlpacaBar[]
      const bars = makeBars()
      s.barOwner.set(bars, symbol)
      return bars
    },
    getQuote: async (symbol: string) => { rec('getQuote', { symbol }); return s.cfg.quotes[symbol] ?? null },
    getMarketMovers: async () => { rec('getMarketMovers'); return Array.from({ length: MOVER_COUNT }, (_, i) => `MOV${i}`) },
    getMacroNews: async () => { rec('getMacroNews'); return [] },
    getNewsForSymbols: async (symbols: string[]) => { rec('getNewsForSymbols', { symbols }); return [] },
    getNextTradingDay: async (from: Date, n: number) => { rec('getNextTradingDay', { from: from.toISOString().slice(0, 10), n }); return nextTradingDay(from, n) },
  }
}

function makeOrderApi({ s, rec }: Ctx) {
  const nextId = (prefix: string) => `${prefix}-${++s.counter.order}`
  return {
    submitLimitOrder: async (symbol: string, qty: number, side: string, limitPrice: number) => {
      rec('submitLimitOrder', { symbol, qty, side, limitPrice, type: 'limit' })
      if (s.cfg.orderError[symbol]) throw new Error(s.cfg.orderError[symbol])
      const id = nextId('order')
      const isFull = (s.cfg.fill[symbol] ?? 'full') === 'full'
      const order = makeOrder(id, symbol, side, qty, isFull ? 'filled' : 'canceled', isFull ? qty : 0, limitPrice)
      s.orders.set(id, order)
      return order
    },
    submitStopOrder: async (symbol: string, qty: number, stopPrice: number) => {
      rec('submitStopOrder', { symbol, qty, stopPrice, side: 'sell', type: 'stop' })
      if (s.cfg.stopErrors[symbol]) throw new Error(s.cfg.stopErrors[symbol])
      return makeOrder(nextId('stop'), symbol, 'sell', qty, 'new', 0, null)
    },
    submitStopLimitOrder: async (symbol: string, qty: number, stopPrice: number, limitPrice: number) => {
      rec('submitStopLimitOrder', { symbol, qty, stopPrice, limitPrice, side: 'sell', type: 'stop_limit' })
      return makeOrder(nextId('stoplimit'), symbol, 'sell', qty, 'new', 0, limitPrice)
    },
    cancelOrder: async (orderId: string) => {
      rec('cancelOrder', { orderId })
      if (s.cfg.cancelErrors[orderId]) throw new Error(s.cfg.cancelErrors[orderId])
    },
    getOrder: async (orderId: string) => { rec('getOrder', { orderId }); return s.orders.get(orderId) as AlpacaOrder },
    getOrders: async (status: string) => {
      rec('getOrders', { status })
      if (status === 'open') return s.cfg.openOrders
      if (status === 'filled') return s.cfg.filledOrders
      return [] as AlpacaOrder[]
    },
    closePosition: async (symbol: string) => { rec('closePosition', { symbol, side: 'sell', type: 'market_close' }) },
    getLatestSellOrder: async (symbol: string) => {
      rec('getLatestSellOrder', { symbol })
      const script = s.cfg.sellOrders[symbol]
      if (!script) return null
      const order = makeOrder(script.id, symbol, 'sell', 10, 'filled', script.filledAvgPrice === null ? 0 : 10, script.filledAvgPrice === null ? null : Number(script.filledAvgPrice))
      return { ...order, filled_at: script.filledAt, filled_avg_price: script.filledAvgPrice }
    },
  }
}

function makeDbReads({ s, rec }: Ctx) {
  return {
    getAllOpenPositionContexts: async () => { rec('db.getAllOpenPositionContexts'); return s.cfg.contexts },
    getOpenPositionContexts: async () => { rec('db.getOpenPositionContexts'); return s.cfg.contexts },
    getTodayBuyExecutions: async () => { rec('db.getTodayBuyExecutions'); return s.cfg.buysToday },
    tradeEvaluationExists: async (symbol: string, buyTimestamp: string) => { rec('db.tradeEvaluationExists', { symbol, buyTimestamp }); return s.cfg.evaluatedTrades.includes(symbol) },
    getActiveNearMissForSymbol: async () => null,
    getAgentLog: async () => [],
    getTradeEvaluations: async () => [],
    getPatternLibrary: async () => [],
  }
}

function makeDbWrites({ rec }: Ctx) {
  return {
    insertAgentLogEntry: async (e: Parameters<typeof summarizeEntry>[0]) => { rec('db.insertAgentLogEntry', summarizeEntry(e)) },
    updatePositionContext: async (symbol: string, patch: Record<string, unknown>) => { rec('db.updatePositionContext', { symbol, patch }) },
    updatePositionProtectiveStop: async (symbol: string, snapshot: unknown) => { rec('db.updatePositionProtectiveStop', { symbol, snapshot }) },
    insertSelectionFailure: async (row: Record<string, unknown>) => { rec('db.insertSelectionFailure', row) },
    saveOpenPositionContext: async (ctx: OpenPositionContext) => { rec('db.saveOpenPositionContext', { ctx }) },
    deleteOpenPositionContext: async (symbol: string) => { rec('db.deleteOpenPositionContext', { symbol }) },
    insertTradeEvaluation: async () => {},
    upsertPattern: async () => {},
  }
}

function makeCooldowns({ s, rec }: Ctx) {
  return {
    upsertSymbolCooldown: async (symbol: string, reason: string, until: Date) => { rec('cooldown.upsert', { symbol, reason, until: until.toISOString() }) },
    getActiveCooldowns: async () => { rec('cooldown.getActive'); return s.cfg.activeCooldowns },
    cleanExpiredCooldowns: async () => { rec('cooldown.cleanExpired') },
  }
}

function resetState(s: State, overrides: Partial<WorldConfig>): void {
  s.calls.length = 0
  s.prompts.length = 0
  s.orders.clear()
  s.counter = { uuid: 0, order: 0 }
  s.cfg = { ...defaults(), ...overrides }
}

export function createWorld() {
  const ctx = makeCtx()
  const { s } = ctx
  return {
    calls: s.calls, prompts: s.prompts, rec: ctx.rec, summarizeEntry, PINS,
    alpaca: { ...makeMarketApi(ctx), ...makeOrderApi(ctx) },
    db: { ...makeDbReads(ctx), ...makeDbWrites(ctx) },
    cooldowns: makeCooldowns(ctx),
    get cfg() { return s.cfg },
    reset: (overrides: Partial<WorldConfig> = {}) => resetState(s, overrides),
    nextUuid: () => `uuid-${String(++s.counter.uuid).padStart(4, '0')}`,
    indicatorsFor: (bars: object): TechnicalIndicators => {
      const symbol = s.barOwner.get(bars)
      const ind = symbol ? s.cfg.indicators[symbol] : undefined
      if (!ind) throw new Error(`no indicators scripted for ${symbol ?? 'unknown symbol'}`)
      return ind
    },
  }
}

export type World = ReturnType<typeof createWorld>
