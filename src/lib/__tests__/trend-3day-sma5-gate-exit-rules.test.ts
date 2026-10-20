import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { enforceExitRules } from '../claude-agent'
import { evaluateSma5EntryGate } from '../sma5-exit'
import type { AlpacaAccount, AlpacaPosition, OpenPositionContext, TechnicalIndicators } from '../types'

const mocks = vi.hoisted(() => ({
  cancelOrder: vi.fn(),
  submitStopOrder: vi.fn(),
  submitStopLimitOrder: vi.fn(),
  closePosition: vi.fn(),
  getLatestSellOrder: vi.fn(),
  getOrders: vi.fn(),
  updatePositionContext: vi.fn(),
  insertAgentLogEntry: vi.fn(),
  evaluateClosedTrade: vi.fn(),
  removeOpenPositionContext: vi.fn(),
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

const ENTRY = 70

function makePosition(): AlpacaPosition {
  return {
    asset_id: 'asset-1',
    symbol: 'FCX',
    exchange: 'NYSE',
    asset_class: 'us_equity',
    avg_entry_price: String(ENTRY),
    qty: '10',
    side: 'long',
    market_value: String(ENTRY * 10),
    cost_basis: String(ENTRY * 10),
    unrealized_pl: '0',
    unrealized_plpc: '0',
    unrealized_intraday_pl: '0',
    unrealized_intraday_plpc: '0',
    current_price: String(ENTRY),
    lastday_price: String(ENTRY),
    change_today: '0',
  }
}

function makeIndicators(currentPrice: number, sma5: number | null, signal: 'NEUTRAL' | 'EXIT_LONG' = 'NEUTRAL'): TechnicalIndicators {
  return {
    rsi: 50,
    macd: null,
    bollingerBands: null,
    sma50: 60,
    sma200: 55,
    ema50: 60,
    ema200: 55,
    distanceToEma50Pct: 5,
    kalman: { stateEstimate: 70, forecastError: 0, errorStdDev: 1, zScore: -0.1, signal },
    currentPrice,
    volume: 1_000_000,
    prevDayVolume: 1_000_000,
    adx: 25,
    atr: 1,
    atrPercentile: 50,
    marketRegime: 'RANGING',
    sma5,
  }
}

function makeCtx(signalType: OpenPositionContext['signalType']): OpenPositionContext {
  return {
    symbol: 'FCX',
    buyTimestamp: new Date(Date.now() - 86_400_000).toISOString(),
    buyPrice: ENTRY,
    quantity: 10,
    indicators: makeIndicators(ENTRY, null),
    claudeReasoning: '',
    patternIdsUsed: [],
    stopOrderId: 'capa-a-1',
    trailingStopOrderId: null,
    signalType,
    highSinceEntry: ENTRY,
    trailingStop: null,
    trailingActivated: false,
  }
}

const ACCOUNT = { id: 'a', cash: '1000', equity: '50000' } as AlpacaAccount

async function run(ctx: OpenPositionContext, ind: TechnicalIndicators) {
  const promise = enforceExitRules([makePosition()], new Map([['FCX', ind]]), [ctx], ACCOUNT)
  await vi.runAllTimersAsync()
  return promise
}

// Exit operator is strict: price > SMA5 fires, equality does not.
const PAIRS: ReadonlyArray<readonly [number, number, boolean]> = [
  [69, 70, false],
  [70, 70, false],
  [70.01, 70, true],
  [73, 70, true],
]

describe('TREND_PULLBACK_3DAY exit uses the shared SMA5 comparison', () => {
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
    mocks.insertAgentLogEntry.mockResolvedValue(undefined)
    mocks.evaluateClosedTrade.mockResolvedValue(undefined)
    mocks.removeOpenPositionContext.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it.each(PAIRS)('price %s vs SMA5 %s: exit fires = %s, and the entry gate blocks exactly then', async (price, sma5, exitFires) => {
    // Arrange
    const ind = makeIndicators(price, sma5)

    // Act
    const result = await run(makeCtx('TREND_PULLBACK_3DAY'), ind)

    // Assert — exit direction
    expect(mocks.closePosition.mock.calls.length > 0).toBe(exitFires)
    if (exitFires) {
      expect(result.decisions[0].decision.reasoning).toBe(`Exit rule: price $${price.toFixed(2)} closed above SMA5 $${sma5.toFixed(2)}`)
      expect(result.exitReasons.get('FCX')).toBe('SMA5_RECLAIM')
    }
    // Assert — entry direction: same answer from the shared function
    expect(evaluateSma5EntryGate(price, sma5) === 'blocked').toBe(exitFires)
  })

  it('does not exit when the SMA5 is null', async () => {
    await run(makeCtx('TREND_PULLBACK_3DAY'), makeIndicators(73, null))

    expect(mocks.closePosition).not.toHaveBeenCalled()
  })

  it('does not exit when the SMA5 is NaN', async () => {
    await run(makeCtx('TREND_PULLBACK_3DAY'), makeIndicators(73, Number.NaN))

    expect(mocks.closePosition).not.toHaveBeenCalled()
  })

  it('does not apply the SMA5 exit to other setups', async () => {
    await run(makeCtx('TREND_PULLBACK'), makeIndicators(73, 70))

    expect(mocks.closePosition).not.toHaveBeenCalled()
  })
})
