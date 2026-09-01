import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { enforceExitRules } from '../claude-agent'
import type { AlpacaPosition, AlpacaAccount, AlpacaOrder, TechnicalIndicators } from '../types'

const { mockGetOrders, mockSubmitStopOrder, mockSaveOpenPositionContext, mockInsertAgentLogEntry } = vi.hoisted(() => ({
  mockGetOrders: vi.fn(),
  mockSubmitStopOrder: vi.fn(),
  mockSaveOpenPositionContext: vi.fn(),
  mockInsertAgentLogEntry: vi.fn(),
}))

vi.mock('../alpaca', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../alpaca')>()
  return {
    ...actual,
    getOrders: mockGetOrders,
    submitStopOrder: mockSubmitStopOrder,
  }
})

vi.mock('../learning', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../learning')>()
  return {
    ...actual,
    saveOpenPositionContext: mockSaveOpenPositionContext,
  }
})

vi.mock('../db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../db')>()
  return {
    ...actual,
    insertAgentLogEntry: mockInsertAgentLogEntry,
  }
})

function makePosition(overrides: Partial<AlpacaPosition> = {}): AlpacaPosition {
  return {
    asset_id: 'asset-1',
    symbol: 'GOOGL',
    exchange: 'NASDAQ',
    asset_class: 'us_equity',
    avg_entry_price: '343.53',
    qty: '13',
    side: 'long',
    market_value: '4500',
    cost_basis: '4465.89',
    unrealized_pl: '34.11',
    unrealized_plpc: '0.0002',
    unrealized_intraday_pl: '34.11',
    unrealized_intraday_plpc: '0.0002',
    current_price: '346.15',
    lastday_price: '344.00',
    change_today: '0.0062',
    ...overrides,
  }
}

function makeOrder(overrides: Partial<AlpacaOrder> & { id: string }): AlpacaOrder {
  return {
    client_order_id: 'client-' + overrides.id,
    created_at: '2026-08-28T14:00:00Z',
    updated_at: '2026-08-28T14:00:00Z',
    submitted_at: '2026-08-28T14:00:00Z',
    filled_at: null,
    symbol: 'GOOGL',
    asset_class: 'us_equity',
    notional: null,
    qty: '13',
    filled_qty: '13',
    filled_avg_price: '343.53',
    order_class: 'simple',
    order_type: 'market',
    type: 'market',
    side: 'sell',
    time_in_force: 'gtc',
    limit_price: null,
    stop_price: '326.35',
    status: 'accepted',
    ...overrides,
  }
}

const ACCOUNT: AlpacaAccount = {
  id: 'acct-1',
  cash: '10000',
  portfolio_value: '50000',
  buying_power: '20000',
  equity: '50000',
  last_equity: '49900',
  long_market_value: '40000',
  short_market_value: '0',
  initial_margin: '0',
  maintenance_margin: '0',
  daytrade_count: 0,
  multiplier: '1',
  pattern_day_trader: false,
  trading_blocked: false,
  account_blocked: false,
} as AlpacaAccount

const INDICATORS: TechnicalIndicators = {
  rsi: 50,
  macd: null,
  bollingerBands: null,
  sma50: 340,
  sma200: 334.55,
  ema50: 340,
  ema200: 330,
  distanceToEma50Pct: 0.5,
  kalman: {
    stateEstimate: 345,
    forecastError: -0.5,
    errorStdDev: 2,
    zScore: -0.244,
    signal: 'NEUTRAL',
  },
  currentPrice: 346.15,
  volume: 1000000,
  prevDayVolume: 900000,
  adx: 20,
  atr: 3,
  atrPercentile: 50,
  marketRegime: 'TRENDING',
}

async function runExitRules(...args: Parameters<typeof enforceExitRules>) {
  const resultPromise = enforceExitRules(...args)
  await vi.runAllTimersAsync()
  return resultPromise
}

describe('enforceExitRules — orphaned-position reconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    mockInsertAgentLogEntry.mockResolvedValue(undefined)
    mockSaveOpenPositionContext.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('no existing sell order — submits a new protective stop and backfills the context', async () => {
    // Arrange — GOOGL open on Alpaca, no ctx, no existing protective order
    mockGetOrders.mockImplementation(async (status: string) => {
      if (status === 'open') return []
      return [makeOrder({ id: 'buy-1', side: 'buy', filled_at: '2026-08-28T13:30:00Z' })]
    })
    mockSubmitStopOrder.mockResolvedValueOnce(makeOrder({ id: 'stop-1', status: 'accepted', filled_qty: '0' }))
    const positions = [makePosition()]
    const indicatorsCache = new Map([['GOOGL', INDICATORS]])

    // Act
    await runExitRules(positions, indicatorsCache, [], ACCOUNT)

    // Assert
    expect(mockSubmitStopOrder).toHaveBeenCalledWith('GOOGL', 13, 343.53 * 0.95)
    expect(mockSaveOpenPositionContext).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        symbol: 'GOOGL',
        buyTimestamp: '2026-08-28T13:30:00Z',
        buyPrice: 343.53,
        quantity: 13,
        signalType: null,
        stopOrderId: 'stop-1',
      })
    )
    expect(mockInsertAgentLogEntry).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        error: 'orphaned_position_reconciled',
        decision: expect.objectContaining({
          reasoning: expect.stringContaining('new stop order stop-1 submitted'),
        }),
      })
    )
  })

  it('existing open sell order found — skips submitting a duplicate stop, still backfills context', async () => {
    // Arrange — a manually-placed GTC stop-sell already exists for GOOGL
    mockGetOrders.mockImplementation(async (status: string) => {
      if (status === 'open') return [makeOrder({ id: 'manual-stop', side: 'sell', status: 'accepted' })]
      return [makeOrder({ id: 'buy-1', side: 'buy', filled_at: '2026-08-28T13:30:00Z' })]
    })
    const positions = [makePosition()]
    const indicatorsCache = new Map([['GOOGL', INDICATORS]])

    // Act
    await runExitRules(positions, indicatorsCache, [], ACCOUNT)

    // Assert
    expect(mockSubmitStopOrder).not.toHaveBeenCalled()
    expect(mockSaveOpenPositionContext).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ symbol: 'GOOGL', stopOrderId: undefined })
    )
    expect(mockInsertAgentLogEntry).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        decision: expect.objectContaining({
          reasoning: expect.stringContaining('existing protective order found'),
        }),
      })
    )
  })

  it('stop submission fails — context is still backfilled (position tracked even if naked)', async () => {
    // Arrange
    mockGetOrders.mockImplementation(async (status: string) => {
      if (status === 'open') return []
      return []
    })
    mockSubmitStopOrder.mockRejectedValue(new Error('insufficient quantity'))
    const positions = [makePosition()]
    const indicatorsCache = new Map([['GOOGL', INDICATORS]])

    // Act
    await runExitRules(positions, indicatorsCache, [], ACCOUNT)

    // Assert — submitStopWithRetry's own retry-once logic runs for real (2 attempts)
    expect(mockSubmitStopOrder).toHaveBeenCalledTimes(2)
    expect(mockSaveOpenPositionContext).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ symbol: 'GOOGL', stopOrderId: undefined })
    )
    expect(mockInsertAgentLogEntry).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        decision: expect.objectContaining({
          reasoning: expect.stringContaining('stop submission FAILED'),
        }),
      })
    )
  })

  it('no matching filled buy order — falls back to the current cycle timestamp', async () => {
    // Arrange — order history has no buy fill for this symbol
    mockGetOrders.mockResolvedValue([])
    mockSubmitStopOrder.mockResolvedValueOnce(makeOrder({ id: 'stop-2' }))
    const positions = [makePosition()]
    const indicatorsCache = new Map([['GOOGL', INDICATORS]])

    // Act
    await runExitRules(positions, indicatorsCache, [], ACCOUNT)

    // Assert — buyTimestamp falls back to a timestamp string (the cycle's own), not null/undefined
    const savedCtx = mockSaveOpenPositionContext.mock.calls[0][0]
    expect(typeof savedCtx.buyTimestamp).toBe('string')
    expect(savedCtx.buyTimestamp.length).toBeGreaterThan(0)
  })

  it('getOrders throws unexpectedly — error is caught and logged, does not crash the loop', async () => {
    // Arrange — a second, healthy position must still be processed after the failure
    mockGetOrders.mockRejectedValue(new Error('network timeout'))
    const positions = [makePosition()]
    const indicatorsCache = new Map([['GOOGL', INDICATORS]])

    // Act / Assert — must not throw
    await expect(enforceExitRules(positions, indicatorsCache, [], ACCOUNT)).resolves.toBeDefined()
    expect(mockSaveOpenPositionContext).not.toHaveBeenCalled()
    expect(mockInsertAgentLogEntry).not.toHaveBeenCalled()
  })
})
