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

const WARNING_TAG = '[TIME_STOP_SKIPPED_INVALID_TIMESTAMP]'

describe('enforceExitRules — time stop with an invalid buyTimestamp', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
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
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  function timeStopWarnings(): unknown[][] {
    return warnSpy.mock.calls.filter((call: unknown[]) => String(call[0]).startsWith(WARNING_TAG))
  }

  it('warns with the symbol and the raw value, and still does not sell', async () => {
    // Arrange
    const ctx = makeCtx({ buyTimestamp: 'not-a-date' })

    // Act
    const result = await run(makePosition(100), ctx)

    // Assert
    expect(warnSpy).toHaveBeenCalledWith(`${WARNING_TAG} symbol=SOFI buyTimestamp=not-a-date`)
    expect(timeStopWarnings()).toHaveLength(1)
    expect(mocks.closePosition).not.toHaveBeenCalled()
    expect(result.exitReasons.size).toBe(0)
  })

  it('does not warn when buyTimestamp is valid', async () => {
    // Arrange
    const ctx = makeCtx()

    // Act
    await run(makePosition(100), ctx)

    // Assert
    expect(timeStopWarnings()).toHaveLength(0)
  })

  it('still fires the time stop for a valid buyTimestamp 28 calendar days old', async () => {
    // Arrange
    const ctx = makeCtx({ buyTimestamp: new Date(Date.now() - 28 * 86_400_000).toISOString() })

    // Act
    const result = await run(makePosition(100), ctx)

    // Assert
    expect(mocks.closePosition).toHaveBeenCalledWith('SOFI')
    expect(result.exitReasons.get('SOFI')).toBe('TIME_STOP')
    expect(timeStopWarnings()).toHaveLength(0)
  })
})
