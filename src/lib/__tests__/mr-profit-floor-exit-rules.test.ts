import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { enforceExitRules } from '../claude-agent'
import type { AlpacaAccount, AlpacaPosition, OpenPositionContext, TechnicalIndicators } from '../types'

const mocks = vi.hoisted(() => ({
  cancelOrder: vi.fn(),
  submitStopOrder: vi.fn(),
  submitStopLimitOrder: vi.fn(),
  closePosition: vi.fn(),
  getLatestSellOrder: vi.fn(),
  getOrders: vi.fn(),
  updatePositionContext: vi.fn(),
  updatePositionProtectiveStop: vi.fn(),
  insertAgentLogEntry: vi.fn(),
  evaluateClosedTrade: vi.fn(),
  removeOpenPositionContext: vi.fn(),
  getPeakHighSinceLastCheck: vi.fn(),
}))

vi.mock('../alpaca', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../alpaca')>()
  return {
    ...actual,
    cancelOrder: mocks.cancelOrder,
    submitStopOrder: mocks.submitStopOrder,
    submitStopLimitOrder: mocks.submitStopLimitOrder,
    closePosition: mocks.closePosition,
    getLatestSellOrder: mocks.getLatestSellOrder,
    getOrders: mocks.getOrders,
  }
})

vi.mock('../db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../db')>()
  return {
    ...actual,
    updatePositionContext: mocks.updatePositionContext,
    updatePositionProtectiveStop: mocks.updatePositionProtectiveStop,
    insertAgentLogEntry: mocks.insertAgentLogEntry,
  }
})

vi.mock('../learning', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../learning')>()
  return {
    ...actual,
    evaluateClosedTrade: mocks.evaluateClosedTrade,
    removeOpenPositionContext: mocks.removeOpenPositionContext,
  }
})

vi.mock('../peak-high', () => ({ getPeakHighSinceLastCheck: mocks.getPeakHighSinceLastCheck }))

const ENTRY = 100

function makePosition(currentPrice: number, overrides: Partial<AlpacaPosition> = {}): AlpacaPosition {
  return {
    asset_id: 'asset-1',
    symbol: 'SOFI',
    exchange: 'NASDAQ',
    asset_class: 'us_equity',
    avg_entry_price: String(ENTRY),
    qty: '10',
    side: 'long',
    market_value: String(currentPrice * 10),
    cost_basis: String(ENTRY * 10),
    unrealized_pl: String((currentPrice - ENTRY) * 10),
    unrealized_plpc: String((currentPrice - ENTRY) / ENTRY),
    unrealized_intraday_pl: '0',
    unrealized_intraday_plpc: '0',
    current_price: String(currentPrice),
    lastday_price: String(ENTRY),
    change_today: '0',
    ...overrides,
  }
}

function makeIndicators(overrides: Partial<TechnicalIndicators> = {}): TechnicalIndicators {
  return {
    rsi: 50,
    macd: null,
    bollingerBands: null,
    sma50: 90,
    sma200: 80,
    ema50: 90,
    ema200: 80,
    distanceToEma50Pct: 5,
    kalman: { stateEstimate: 100, forecastError: 0, errorStdDev: 1, zScore: -0.1, signal: 'NEUTRAL' },
    currentPrice: ENTRY,
    volume: 1_000_000,
    prevDayVolume: 1_000_000,
    adx: 25,
    atr: 2,
    atrPercentile: 50,
    marketRegime: 'RANGING',
    ...overrides,
  }
}

function makeCtx(overrides: Partial<OpenPositionContext> = {}): OpenPositionContext {
  return {
    symbol: 'SOFI',
    buyTimestamp: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    buyPrice: ENTRY,
    quantity: 10,
    indicators: makeIndicators(),
    claudeReasoning: '',
    patternIdsUsed: [],
    stopOrderId: 'capa-a-1',
    trailingStopOrderId: null,
    signalType: 'MEAN_REVERSION',
    highSinceEntry: ENTRY,
    trailingStop: null,
    trailingActivated: false,
    ...overrides,
  }
}

const ACCOUNT = { id: 'a', cash: '1000', equity: '50000' } as AlpacaAccount

async function run(position: AlpacaPosition, ctx: OpenPositionContext, ind = makeIndicators()) {
  const cache = new Map<string, TechnicalIndicators>([[position.symbol, ind]])
  const promise = enforceExitRules([position], cache, [ctx], ACCOUNT)
  await vi.runAllTimersAsync()
  return promise
}

function orderMoved(): boolean {
  return mocks.cancelOrder.mock.calls.length > 0 ||
    mocks.submitStopOrder.mock.calls.length > 0 ||
    mocks.submitStopLimitOrder.mock.calls.length > 0
}

describe('enforceExitRules — MEAN_REVERSION profit floor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    mocks.cancelOrder.mockResolvedValue(undefined)
    mocks.submitStopOrder.mockResolvedValue({ id: 'floor-1' })
    mocks.submitStopLimitOrder.mockResolvedValue({ id: 'limit-1' })
    mocks.closePosition.mockResolvedValue({})
    mocks.getLatestSellOrder.mockResolvedValue(null)
    mocks.getOrders.mockResolvedValue([])
    mocks.updatePositionContext.mockResolvedValue(undefined)
    mocks.updatePositionProtectiveStop.mockResolvedValue(undefined)
    mocks.insertAgentLogEntry.mockResolvedValue(undefined)
    mocks.evaluateClosedTrade.mockResolvedValue(undefined)
    mocks.removeOpenPositionContext.mockResolvedValue(undefined)
    mocks.getPeakHighSinceLastCheck.mockResolvedValue(null)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('stays inactive below +5%: no order moves, only highSinceEntry persisted', async () => {
    // Arrange
    const ctx = makeCtx({ highSinceEntry: 104 })

    // Act
    await run(makePosition(104), ctx)

    // Assert
    expect(orderMoved()).toBe(false)
    expect(mocks.updatePositionContext).toHaveBeenCalledWith('SOFI', { highSinceEntry: 104 })
  })

  it('places a plain stop (market, GTC path) at the +3% floor on activation, cancelling Capa A', async () => {
    // Arrange — high +6% -> floor +3%
    const ctx = makeCtx({ highSinceEntry: 106 })

    // Act
    await run(makePosition(105), ctx)

    // Assert
    expect(mocks.cancelOrder).toHaveBeenCalledWith('capa-a-1')
    expect(mocks.submitStopOrder).toHaveBeenCalledWith('SOFI', 10, 103)
    expect(mocks.submitStopLimitOrder).not.toHaveBeenCalled()
    expect(mocks.updatePositionContext).toHaveBeenCalledWith('SOFI', { trailingStopOrderId: 'floor-1', stopOrderId: null })
    expect(mocks.updatePositionContext).toHaveBeenCalledWith('SOFI', { highSinceEntry: 106, trailingStop: 103, trailingActivated: true })
  })

  it('works even when ATR is null', async () => {
    const ctx = makeCtx({ highSinceEntry: 106 })

    await run(makePosition(105), ctx, makeIndicators({ atr: null }))

    expect(mocks.submitStopOrder).toHaveBeenCalledWith('SOFI', 10, 103)
  })

  it('does not cancel or create when the floor is unchanged and an order is registered', async () => {
    const ctx = makeCtx({ highSinceEntry: 106, trailingStop: 103, trailingActivated: true, trailingStopOrderId: 'floor-1', stopOrderId: null })

    await run(makePosition(105), ctx)

    expect(orderMoved()).toBe(false)
  })

  it('does not replace when the new floor is below one tick above the old one', async () => {
    const ctx = makeCtx({ highSinceEntry: 106, trailingStop: 103.005, trailingActivated: true, trailingStopOrderId: 'floor-1', stopOrderId: null })

    await run(makePosition(105), ctx)

    expect(orderMoved()).toBe(false)
  })

  it('replaces the registered trailing order when the floor rises', async () => {
    const ctx = makeCtx({ highSinceEntry: 108, trailingStop: 103, trailingActivated: true, trailingStopOrderId: 'floor-1', stopOrderId: null })

    await run(makePosition(107), ctx)

    expect(mocks.cancelOrder).toHaveBeenCalledWith('floor-1')
    expect(mocks.submitStopOrder).toHaveBeenCalledWith('SOFI', 10, 105)
  })

  it('re-places a stop when active but no order id is registered (self-heal)', async () => {
    const ctx = makeCtx({ highSinceEntry: 106, trailingStop: 103, trailingActivated: true, trailingStopOrderId: null, stopOrderId: null })

    await run(makePosition(105), ctx)

    expect(mocks.cancelOrder).not.toHaveBeenCalled()
    expect(mocks.submitStopOrder).toHaveBeenCalledWith('SOFI', 10, 103)
  })

  it('does not submit when the cancel fails and retries next cycle (stop not persisted)', async () => {
    mocks.cancelOrder.mockRejectedValue(new Error('cancel boom'))
    const ctx = makeCtx({ highSinceEntry: 106 })

    await run(makePosition(105), ctx)

    expect(mocks.submitStopOrder).not.toHaveBeenCalled()
    expect(mocks.insertAgentLogEntry).toHaveBeenCalledWith(expect.objectContaining({ error: 'trailing_stop_naked' }))
    expect(mocks.updatePositionContext).not.toHaveBeenCalledWith('SOFI', expect.objectContaining({ trailingStop: 103 }))
    expect(mocks.updatePositionProtectiveStop).not.toHaveBeenCalled()
  })

  it('moves no broker order when the profit target already fired, but still persists the high', async () => {
    // Arrange — +10% target hit in the same run
    const ctx = makeCtx({ highSinceEntry: 110 })

    // Act
    const result = await run(makePosition(110), ctx)

    // Assert
    expect(mocks.cancelOrder).not.toHaveBeenCalled()
    expect(mocks.submitStopOrder).not.toHaveBeenCalled()
    expect(mocks.updatePositionContext).toHaveBeenCalledWith('SOFI', { highSinceEntry: 110 })
    expect(mocks.closePosition).toHaveBeenCalledWith('SOFI')
    expect(result.exitReasons.get('SOFI')).toBe('PROFIT_TARGET')
  })

  it('moves no broker order when the z-score exit already fired', async () => {
    const ctx = makeCtx({ highSinceEntry: 106 })
    const ind = makeIndicators({ kalman: { stateEstimate: 100, forecastError: 0, errorStdDev: 1, zScore: -0.5, signal: 'EXIT_LONG' } })

    const result = await run(makePosition(105), ctx, ind)

    expect(orderMoved()).toBe(false)
    expect(result.exitReasons.get('SOFI')).toBe('Z_SCORE_EXIT')
  })

  it('sells now when price is at or below the floor, with the profit-floor text and TRAILING_STOP mapping', async () => {
    // Arrange — high +6% -> floor 103; price 102.5
    const ctx = makeCtx({ highSinceEntry: 106 })

    // Act
    const result = await run(makePosition(102.5), ctx)

    // Assert
    expect(mocks.closePosition).toHaveBeenCalledWith('SOFI')
    expect(orderMoved()).toBe(false)
    expect(result.decisions[0].decision.reasoning).toBe('Exit rule: profit floor $103.00 (+3.00%) breached')
    expect(result.exitReasons.get('SOFI')).toBe('TRAILING_STOP')
  })

  it('uses the 1-minute peak when it exceeds the stored high and never lowers the high', async () => {
    mocks.getPeakHighSinceLastCheck.mockResolvedValue(108)
    const ctx = makeCtx({ highSinceEntry: 104 })

    await run(makePosition(106), ctx)

    expect(mocks.submitStopOrder).toHaveBeenCalledWith('SOFI', 10, 105)
    expect(mocks.updatePositionContext).toHaveBeenCalledWith('SOFI', expect.objectContaining({ highSinceEntry: 108 }))
  })

  it('keeps the stored high when the peak is lower', async () => {
    mocks.getPeakHighSinceLastCheck.mockResolvedValue(101)
    const ctx = makeCtx({ highSinceEntry: 104 })

    await run(makePosition(103), ctx)

    expect(mocks.updatePositionContext).toHaveBeenCalledWith('SOFI', { highSinceEntry: 104 })
  })

  it('persists the protectiveStop snapshot with design R when the stop moves', async () => {
    const ctx = makeCtx({ highSinceEntry: 108.14 })

    await run(makePosition(107), ctx)

    expect(mocks.updatePositionProtectiveStop).toHaveBeenCalledWith('SOFI', {
      design: 'R',
      activationPct: 5,
      floorPct: 3,
      ratchetPp: 3,
      activatedAt: expect.any(String),
      highPct: expect.closeTo(8.14, 6),
      stopPrice: 105.14,
      stopOrderId: 'floor-1',
    })
  })

  it('preserves activatedAt from the stored snapshot on refresh', async () => {
    const stored = { design: 'R' as const, activationPct: 5, floorPct: 3, ratchetPp: 3, activatedAt: '2026-10-19T15:00:00.000Z', highPct: 6, stopPrice: 103, stopOrderId: 'floor-1' }
    const ctx = makeCtx({
      highSinceEntry: 108,
      trailingStop: 103,
      trailingActivated: true,
      trailingStopOrderId: 'floor-1',
      stopOrderId: null,
      indicators: makeIndicators({ protectiveStop: stored }),
    })

    await run(makePosition(107), ctx)

    expect(mocks.updatePositionProtectiveStop).toHaveBeenCalledWith('SOFI', expect.objectContaining({ activatedAt: '2026-10-19T15:00:00.000Z', stopPrice: 105 }))
  })

  it('does not abort when persisting protectiveStop fails', async () => {
    mocks.updatePositionProtectiveStop.mockRejectedValue(new Error('db down'))
    const ctx = makeCtx({ highSinceEntry: 106 })

    await expect(run(makePosition(105), ctx)).resolves.toBeDefined()
    expect(mocks.submitStopOrder).toHaveBeenCalled()
  })

  it('adds profitFloor to the HOLD reasoning while active', async () => {
    const ctx = makeCtx({ highSinceEntry: 106, trailingStop: 103, trailingActivated: true, trailingStopOrderId: 'floor-1', stopOrderId: null })

    await run(makePosition(105), ctx)

    expect(mocks.insertAgentLogEntry).toHaveBeenCalledWith(expect.objectContaining({
      decision: expect.objectContaining({ reasoning: expect.stringContaining('profitFloor=$103.00') }),
    }))
  })
})

describe('enforceExitRules — other setups keep their trailing with tick safety', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    mocks.cancelOrder.mockResolvedValue(undefined)
    mocks.submitStopOrder.mockResolvedValue({ id: 'stop-1' })
    mocks.submitStopLimitOrder.mockResolvedValue({ id: 'limit-1' })
    mocks.closePosition.mockResolvedValue({})
    mocks.getLatestSellOrder.mockResolvedValue(null)
    mocks.getOrders.mockResolvedValue([])
    mocks.updatePositionContext.mockResolvedValue(undefined)
    mocks.updatePositionProtectiveStop.mockResolvedValue(undefined)
    mocks.insertAgentLogEntry.mockResolvedValue(undefined)
    mocks.evaluateClosedTrade.mockResolvedValue(undefined)
    mocks.removeOpenPositionContext.mockResolvedValue(undefined)
    mocks.getPeakHighSinceLastCheck.mockResolvedValue(null)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function trendCtx(overrides: Partial<OpenPositionContext> = {}) {
    return makeCtx({ signalType: 'TREND_PULLBACK', highSinceEntry: 108, trailingActivated: true, trailingStop: 105, trailingStopOrderId: 'old-1', stopOrderId: null, ...overrides })
  }

  it('still submits a stop-limit with tick-rounded stop and limit when the stop rises', async () => {
    // high 108.37, atr 1 -> distance max(1.5, 1.6256) = 1.6256 -> stop 106.7444 -> 106.74; limit 106.74*0.995=106.2063 -> 106.20
    const ctx = trendCtx({ highSinceEntry: 108.37 })
    const ind = makeIndicators({ atr: 1, ema50: 90 })

    await run(makePosition(108), ctx, ind)

    expect(mocks.submitStopOrder).not.toHaveBeenCalled()
    expect(mocks.submitStopLimitOrder).toHaveBeenCalledWith('SOFI', 10, 106.74, 106.2)
  })

  it('does not replace when the rounded stop is not a full tick above the previous one', async () => {
    const ctx = trendCtx({ highSinceEntry: 108.37, trailingStop: 106.74 })
    const ind = makeIndicators({ atr: 1, ema50: 90 })

    await run(makePosition(108), ctx, ind)

    expect(mocks.cancelOrder).not.toHaveBeenCalled()
    expect(mocks.submitStopLimitOrder).not.toHaveBeenCalled()
  })

  it('does not move orders when another exit already fired in the same run', async () => {
    const ctx = trendCtx({ highSinceEntry: 108.37 })
    const ind = makeIndicators({ atr: 1, ema50: 109 })

    const result = await run(makePosition(108), ctx, ind)

    expect(mocks.cancelOrder).not.toHaveBeenCalled()
    expect(mocks.submitStopLimitOrder).not.toHaveBeenCalled()
    expect(result.exitReasons.get('SOFI')).toBe('EMA_FAILURE')
  })
})
