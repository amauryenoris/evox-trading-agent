import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { submitStopLimitWithRetry, replaceProtectiveOrder } from '../protective-orders'
import type { AlpacaAccount, AlpacaPosition, OpenPositionContext, TechnicalIndicators } from '../types'

const mocks = vi.hoisted(() => ({
  cancelOrder: vi.fn(),
  submitStopOrder: vi.fn(),
  submitStopLimitOrder: vi.fn(),
  updatePositionContext: vi.fn(),
  updatePositionProtectiveStop: vi.fn(),
  insertAgentLogEntry: vi.fn(),
}))

vi.mock('../alpaca', () => ({
  cancelOrder: mocks.cancelOrder,
  submitStopOrder: mocks.submitStopOrder,
  submitStopLimitOrder: mocks.submitStopLimitOrder,
}))

vi.mock('../db', () => ({
  updatePositionContext: mocks.updatePositionContext,
  updatePositionProtectiveStop: mocks.updatePositionProtectiveStop,
  insertAgentLogEntry: mocks.insertAgentLogEntry,
}))

const RETRY_DELAY_MS = 3000

describe('submitStopLimitWithRetry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.submitStopLimitOrder.mockReset()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('returns stopOrderId on the first attempt without warning', async () => {
    // Arrange
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mocks.submitStopLimitOrder.mockResolvedValueOnce({ id: 'sl-1' })

    // Act
    const result = await submitStopLimitWithRetry('NVDA', 10, 100, 99.5, 0)

    // Assert
    expect(result).toEqual({ stopOrderId: 'sl-1', failureReason: undefined })
    expect(mocks.submitStopLimitOrder).toHaveBeenCalledTimes(1)
    expect(mocks.submitStopLimitOrder).toHaveBeenCalledWith('NVDA', 10, 100, 99.5)
    expect(warn).not.toHaveBeenCalled()
  })

  it('retries after the 3000 ms delay and returns the second order id', async () => {
    // Arrange
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mocks.submitStopLimitOrder
      .mockRejectedValueOnce(new Error('boom1'))
      .mockResolvedValueOnce({ id: 'sl-2' })

    // Act
    const promise = submitStopLimitWithRetry('CVX', 5, 100, 99.5)
    await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS - 1)
    const callsBeforeDelay = mocks.submitStopLimitOrder.mock.calls.length
    await vi.advanceTimersByTimeAsync(1)
    const result = await promise

    // Assert
    expect(callsBeforeDelay).toBe(1)
    expect(mocks.submitStopLimitOrder).toHaveBeenCalledTimes(2)
    expect(result).toEqual({ stopOrderId: 'sl-2', failureReason: undefined })
    expect(warn).toHaveBeenCalledWith(
      '[TRAILING] First stop-limit attempt failed for CVX — retrying in 3000ms:',
      expect.objectContaining({ message: 'boom1' })
    )
  })

  it('returns the failure reason and logs the NAKED error after two failures', async () => {
    // Arrange
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.submitStopLimitOrder
      .mockRejectedValueOnce(new Error('boom1'))
      .mockRejectedValueOnce(new Error('boom2'))

    // Act
    const promise = submitStopLimitWithRetry('OXY', 7, 50, 49.5)
    await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS)
    const result = await promise

    // Assert
    expect(result).toEqual({ stopOrderId: undefined, failureReason: 'boom2' })
    expect(mocks.submitStopLimitOrder).toHaveBeenCalledTimes(2)
    expect(warn).toHaveBeenCalledWith(
      '[TRAILING] First stop-limit attempt failed for OXY — retrying in 3000ms:',
      expect.objectContaining({ message: 'boom1' })
    )
    expect(error).toHaveBeenCalledWith(
      '[TRAILING] Stop-limit retry also failed for OXY — position is NAKED:',
      'boom2'
    )
  })
})

describe('replaceProtectiveOrder', () => {
  const position = { symbol: 'AAPL' } as AlpacaPosition
  const account = { equity: 10000, cash: 5000 } as unknown as AlpacaAccount
  const ind = {} as TechnicalIndicators

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.updatePositionContext.mockResolvedValue(undefined)
    mocks.insertAgentLogEntry.mockResolvedValue(undefined)
  })

  it('returns skipped and touches nothing when ctx.quantity is 0', async () => {
    // Arrange
    const ctx = { quantity: 0, trailingStopOrderId: 'T1', stopOrderId: 'S1' } as OpenPositionContext

    // Act
    const result = await replaceProtectiveOrder({
      position, ctx, ind, account, positionCount: 1, timestamp: 't', targetStop: 10, limitPrice: null,
    })

    // Assert
    expect(result).toEqual({ outcome: 'skipped', stopOrderId: null })
    expect(mocks.cancelOrder).not.toHaveBeenCalled()
    expect(mocks.submitStopOrder).not.toHaveBeenCalled()
    expect(mocks.submitStopLimitOrder).not.toHaveBeenCalled()
    expect(mocks.updatePositionContext).not.toHaveBeenCalled()
    expect(mocks.insertAgentLogEntry).not.toHaveBeenCalled()
  })

  it('cancels the registered stop before submitting the replacement', async () => {
    // Arrange
    const calls: string[] = []
    mocks.cancelOrder.mockImplementation(async () => { calls.push('cancel') })
    mocks.submitStopOrder.mockImplementation(async () => { calls.push('submit'); return { id: 'new-stop' } })
    const ctx = { quantity: 10, trailingStopOrderId: 'T1', stopOrderId: 'S1' } as OpenPositionContext

    // Act
    const result = await replaceProtectiveOrder({
      position, ctx, ind, account, positionCount: 1, timestamp: 't', targetStop: 10, limitPrice: null,
    })

    // Assert
    expect(calls).toEqual(['cancel', 'submit'])
    expect(mocks.cancelOrder).toHaveBeenCalledWith('T1')
    expect(result).toEqual({ outcome: 'moved', stopOrderId: 'new-stop' })
  })
})
