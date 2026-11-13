import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { executeIocWithRemainderRetry } from '../order-execution'
import type { AlpacaOrder } from '../types'

const mocks = vi.hoisted(() => ({
  submitLimitOrder: vi.fn(),
  getOrder: vi.fn(),
  cancelOrder: vi.fn(),
  getQuote: vi.fn(),
}))

vi.mock('../alpaca', () => ({
  submitLimitOrder: mocks.submitLimitOrder,
  getOrder: mocks.getOrder,
  cancelOrder: mocks.cancelOrder,
  getQuote: mocks.getQuote,
}))

vi.mock('../config', () => ({ MAX_SPREAD_BPS: 100 }))

const SYMBOL = 'AAA'
const REQUESTED_QTY = 100
const LIMIT_PRICE = 50
const FIRST_SPREAD_BPS = 20
const POLL_DELAY_MS = 1500
const FRESH_QUOTE = { bid: 49.9, ask: 50, spread: 0.1, spreadBps: 20, fresh: true }

const orders = new Map<string, AlpacaOrder>()

function makeOrder(id: string, status: string, filled: number, avgPrice: string | null): AlpacaOrder {
  const order = { id, symbol: SYMBOL, status, filled_qty: String(filled), filled_avg_price: avgPrice } as AlpacaOrder
  orders.set(id, order)
  return order
}

async function settle<T>(promise: Promise<T>): Promise<T> {
  await vi.advanceTimersByTimeAsync(POLL_DELAY_MS * 5)
  return promise
}

describe('executeIocWithRemainderRetry', () => {
  let log: ReturnType<typeof vi.spyOn>
  let warn: ReturnType<typeof vi.spyOn>
  let error: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    orders.clear()
    vi.useFakeTimers()
    log = vi.spyOn(console, 'log').mockImplementation(() => {})
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    error = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.getOrder.mockImplementation(async (id: string) => orders.get(id))
    mocks.getQuote.mockResolvedValue(FRESH_QUOTE)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('full fill: one attempt, the filled average price and no quote or polling', async () => {
    // Arrange
    mocks.submitLimitOrder.mockResolvedValueOnce(makeOrder('o1', 'filled', 100, '49.95'))

    // Act
    const result = await settle(executeIocWithRemainderRetry(SYMBOL, REQUESTED_QTY, LIMIT_PRICE, FIRST_SPREAD_BPS))

    // Assert
    expect(result.totalFilledQty).toBe(100)
    expect(result.avgFillPrice).toBe(49.95)
    expect(result.attempts).toEqual([
      { orderId: 'o1', qtyRequested: 100, qtyFilled: 100, limitPrice: 50, avgFillPrice: 49.95, status: 'filled' },
    ])
    expect(mocks.getQuote).not.toHaveBeenCalled()
    expect(mocks.getOrder).not.toHaveBeenCalled()
    expect(log).toHaveBeenCalledWith('[ORDER] AAA limit IOC BUY @ $50 id: o1 status: filled filled: 100/100 spread: 20bps')
    expect(log).toHaveBeenCalledWith('[IOC_REMAINDER_RETRY] AAA: requested 100, attempts 1, filled 100')
  })

  it('partial fill without filled_avg_price: uses the limit price, warns and stops when the quote gate fails', async () => {
    // Arrange
    mocks.submitLimitOrder.mockResolvedValueOnce(makeOrder('o1', 'canceled', 60, null))
    mocks.getQuote.mockResolvedValue(null)

    // Act
    const result = await settle(executeIocWithRemainderRetry(SYMBOL, REQUESTED_QTY, LIMIT_PRICE, FIRST_SPREAD_BPS))

    // Assert
    expect(result.totalFilledQty).toBe(60)
    expect(result.avgFillPrice).toBe(50)
    expect(result.attempts).toHaveLength(1)
    expect(result.attempts[0].avgFillPrice).toBe(50)
    expect(warn).toHaveBeenCalledWith('[IOC_RETRY] AAA order o1 filled 60 but has no filled_avg_price — using limit price $50 instead')
    expect(log).toHaveBeenCalledWith('[IOC_RETRY] AAA stopping remainder retries — gate check failed (remainder=40)')
    expect(mocks.submitLimitOrder).toHaveBeenCalledTimes(1)
  })

  it('retry that fills 0 shares: keeps the weighted average of the real fill, logs and stops', async () => {
    // Arrange
    mocks.submitLimitOrder
      .mockResolvedValueOnce(makeOrder('o1', 'canceled', 60, '50'))
      .mockResolvedValueOnce(makeOrder('o2', 'canceled', 0, null))

    // Act
    const result = await settle(executeIocWithRemainderRetry(SYMBOL, REQUESTED_QTY, LIMIT_PRICE, FIRST_SPREAD_BPS))

    // Assert
    expect(result.totalFilledQty).toBe(60)
    expect(result.avgFillPrice).toBe(50)
    expect(result.attempts).toHaveLength(2)
    expect(result.attempts[1]).toEqual({ orderId: 'o2', qtyRequested: 40, qtyFilled: 0, limitPrice: 50, avgFillPrice: null, status: 'canceled' })
    expect(mocks.submitLimitOrder).toHaveBeenNthCalledWith(1, SYMBOL, 100, 'buy', 50)
    expect(mocks.submitLimitOrder).toHaveBeenNthCalledWith(2, SYMBOL, 40, 'buy', 50)
    expect(log).toHaveBeenCalledWith('[ORDER] AAA limit IOC BUY retry @ $50 id: o2 status: canceled filled: 0/40 spread: 20bps')
    expect(log).toHaveBeenCalledWith('[IOC_RETRY] AAA stopping remainder retries — retry filled 0 shares')
    expect(log).toHaveBeenCalledWith('[IOC_REMAINDER_RETRY] AAA: requested 100, attempts 2, filled 60')
    expect(mocks.getQuote).toHaveBeenCalledTimes(1)
  })

  it('retry that throws: keeps the fills already obtained, logs the error and stops', async () => {
    // Arrange
    const retryError = new Error('retry boom')
    mocks.submitLimitOrder
      .mockResolvedValueOnce(makeOrder('o1', 'canceled', 60, '50'))
      .mockRejectedValueOnce(retryError)

    // Act
    const result = await settle(executeIocWithRemainderRetry(SYMBOL, REQUESTED_QTY, LIMIT_PRICE, FIRST_SPREAD_BPS))

    // Assert
    expect(result.totalFilledQty).toBe(60)
    expect(result.avgFillPrice).toBe(50)
    expect(result.attempts).toHaveLength(1)
    expect(error).toHaveBeenCalledWith('[IOC_RETRY] AAA retry attempt failed — keeping fills already obtained:', retryError)
    expect(log).toHaveBeenCalledWith('[IOC_REMAINDER_RETRY] AAA: requested 100, attempts 1, filled 60')
    expect(mocks.submitLimitOrder).toHaveBeenCalledTimes(2)
  })
})
