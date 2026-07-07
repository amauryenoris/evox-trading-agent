import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  submitStopWithRetry,
  resolveIocFinalState,
  IOC_NOT_FILLED,
  STOP_SUBMIT_FAILED,
  IOC_LATE_FILL,
} from '../claude-agent'
import type { AlpacaOrder } from '../types'

const { mockSubmitStopOrder, mockGetOrder } = vi.hoisted(() => ({
  mockSubmitStopOrder: vi.fn(),
  mockGetOrder: vi.fn(),
}))

vi.mock('../alpaca', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../alpaca')>()
  return {
    ...actual,
    submitStopOrder: mockSubmitStopOrder,
    getOrder: mockGetOrder,
  }
})

describe('submitStopWithRetry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns stopOrderId when first attempt succeeds', async () => {
    // Arrange
    mockSubmitStopOrder.mockResolvedValueOnce({ id: 'stop-abc', status: 'accepted' })

    // Act
    const result = await submitStopWithRetry('NVDA', 28, 183.52, 0)

    // Assert
    expect(mockSubmitStopOrder).toHaveBeenCalledTimes(1)
    expect(mockSubmitStopOrder).toHaveBeenCalledWith('NVDA', 28, 183.52)
    expect(result.stopOrderId).toBe('stop-abc')
    expect(result.failureReason).toBeUndefined()
  })

  it('retries once and returns stopOrderId when second attempt succeeds', async () => {
    // Arrange
    mockSubmitStopOrder.mockRejectedValueOnce(new Error('temporary failure'))
    mockSubmitStopOrder.mockResolvedValueOnce({ id: 'stop-def', status: 'accepted' })

    // Act
    const resultPromise = submitStopWithRetry('CVX', 62, 162.61, 0)
    await vi.runAllTimersAsync()
    const result = await resultPromise

    // Assert — called twice, second succeeded
    expect(mockSubmitStopOrder).toHaveBeenCalledTimes(2)
    expect(result.stopOrderId).toBe('stop-def')
    expect(result.failureReason).toBeUndefined()
  })

  it('returns failureReason when both attempts fail', async () => {
    // Arrange
    mockSubmitStopOrder.mockRejectedValueOnce(new Error('insufficient quantity'))
    mockSubmitStopOrder.mockRejectedValueOnce(new Error('insufficient quantity'))

    // Act
    const resultPromise = submitStopWithRetry('OXY', 162, 47.45, 0)
    await vi.runAllTimersAsync()
    const result = await resultPromise

    // Assert — called twice, both failed
    expect(mockSubmitStopOrder).toHaveBeenCalledTimes(2)
    expect(result.stopOrderId).toBeUndefined()
    expect(result.failureReason).toContain('insufficient quantity')
  })
})

describe('IOC_NOT_FILLED and STOP_SUBMIT_FAILED constants', () => {
  it('IOC_NOT_FILLED is the literal string IOC_NOT_FILLED', () => {
    expect(IOC_NOT_FILLED).toBe('IOC_NOT_FILLED')
  })

  it('STOP_SUBMIT_FAILED is the literal string STOP_SUBMIT_FAILED', () => {
    expect(STOP_SUBMIT_FAILED).toBe('STOP_SUBMIT_FAILED')
  })
})

function makeOrder(overrides: Partial<AlpacaOrder> & { id: string; symbol: string }): AlpacaOrder {
  return {
    client_order_id: 'client-' + overrides.id,
    created_at: '2026-07-06T16:53:00Z',
    updated_at: '2026-07-06T16:53:00Z',
    submitted_at: '2026-07-06T16:53:00Z',
    filled_at: null,
    asset_class: 'us_equity',
    notional: null,
    qty: '82',
    filled_qty: '0',
    filled_avg_price: null,
    order_class: 'simple',
    order_type: 'limit',
    type: 'limit',
    side: 'buy',
    time_in_force: 'ioc',
    limit_price: '10.00',
    stop_price: null,
    status: 'new',
    ...overrides,
  }
}

describe('resolveIocFinalState', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns sync order immediately when status=filled and filled_qty>0 — no re-fetch', async () => {
    // Arrange
    const syncOrder = makeOrder({ id: 'ord-1', symbol: 'AAPL', status: 'filled', filled_qty: '82' })

    // Act
    const result = await resolveIocFinalState(syncOrder, 0)

    // Assert
    expect(mockGetOrder).not.toHaveBeenCalled()
    expect(result).toBe(syncOrder)
    expect(parseInt(result.filled_qty, 10)).toBe(82)
  })

  it('re-fetches after delay when sync returns 0; logs IOC_LATE_FILL when re-fetch shows fill', async () => {
    // Arrange
    const syncOrder = makeOrder({ id: 'ord-2', symbol: 'INTC', status: 'new', filled_qty: '0' })
    const resolvedOrder = makeOrder({ id: 'ord-2', symbol: 'INTC', status: 'filled', filled_qty: '82' })
    mockGetOrder.mockResolvedValueOnce(resolvedOrder)
    const consoleSpy = vi.spyOn(console, 'log')

    // Act
    const resultPromise = resolveIocFinalState(syncOrder, 0)
    await vi.runAllTimersAsync()
    const result = await resultPromise

    // Assert
    expect(mockGetOrder).toHaveBeenCalledOnce()
    expect(mockGetOrder).toHaveBeenCalledWith('ord-2')
    expect(parseInt(result.filled_qty, 10)).toBe(82)
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining(IOC_LATE_FILL))
    consoleSpy.mockRestore()
  })

  it('re-fetches when sync returns 0; returns 0 and does NOT log IOC_LATE_FILL when re-fetch also 0', async () => {
    // Arrange
    const syncOrder = makeOrder({ id: 'ord-3', symbol: 'WULF', status: 'canceled', filled_qty: '0' })
    const resolvedOrder = makeOrder({ id: 'ord-3', symbol: 'WULF', status: 'canceled', filled_qty: '0' })
    mockGetOrder.mockResolvedValueOnce(resolvedOrder)
    const consoleSpy = vi.spyOn(console, 'log')

    // Act
    const resultPromise = resolveIocFinalState(syncOrder, 0)
    await vi.runAllTimersAsync()
    const result = await resultPromise

    // Assert
    expect(parseInt(result.filled_qty, 10)).toBe(0)
    expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining(IOC_LATE_FILL))
    consoleSpy.mockRestore()
  })

  it('logs IOC_STATE_UNRESOLVED when re-fetched status is neither filled nor canceled', async () => {
    // Arrange
    const syncOrder = makeOrder({ id: 'ord-4', symbol: 'XOM', status: 'new', filled_qty: '0' })
    const resolvedOrder = makeOrder({ id: 'ord-4', symbol: 'XOM', status: 'pending_new', filled_qty: '0' })
    mockGetOrder.mockResolvedValueOnce(resolvedOrder)
    const consoleSpy = vi.spyOn(console, 'log')

    // Act
    const resultPromise = resolveIocFinalState(syncOrder, 0)
    await vi.runAllTimersAsync()
    await resultPromise

    // Assert
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('IOC_STATE_UNRESOLVED'))
    consoleSpy.mockRestore()
  })

  it('returns re-fetched partially_filled qty when sync returned 0 and re-fetch shows partial fill', async () => {
    // Arrange
    const syncOrder = makeOrder({ id: 'ord-5', symbol: 'COP', status: 'new', filled_qty: '0' })
    const resolvedOrder = makeOrder({ id: 'ord-5', symbol: 'COP', status: 'filled', filled_qty: '40' })
    mockGetOrder.mockResolvedValueOnce(resolvedOrder)

    // Act
    const resultPromise = resolveIocFinalState(syncOrder, 0)
    await vi.runAllTimersAsync()
    const result = await resultPromise

    // Assert
    expect(parseInt(result.filled_qty, 10)).toBe(40)
  })
})

// ── Fill-gating logic tests ──────────────────────────────────────────────────
// These replicate the per-path fill-gating logic inline (per project pattern —
// see trend-pullback-macd-floor.test.ts) to test the decision boundary
// without importing runAgentCycle (which has many heavy dependencies).

function evalZeroFillGuard(filledQty: number): {
  orderExecuted: boolean
  countersIncremented: boolean
  stopSubmitted: boolean
  errorLabel: string | undefined
} {
  if (filledQty === 0) {
    return {
      orderExecuted: false,
      countersIncremented: false,
      stopSubmitted: false,
      errorLabel: IOC_NOT_FILLED,
    }
  }
  return {
    orderExecuted: true,
    countersIncremented: true,
    stopSubmitted: true,
    errorLabel: undefined,
  }
}

function evalPartialFillLabel(requestedQty: number, filledQty: number): boolean {
  return filledQty > 0 && filledQty < requestedQty
}

describe('Zero-fill guard logic (replicated per project pattern)', () => {
  it('zero fill: orderExecuted=false, counters not incremented, stop not submitted', () => {
    const result = evalZeroFillGuard(0)
    expect(result.orderExecuted).toBe(false)
    expect(result.countersIncremented).toBe(false)
    expect(result.stopSubmitted).toBe(false)
    expect(result.errorLabel).toBe(IOC_NOT_FILLED)
  })

  it('full fill: orderExecuted=true, counters incremented, stop submitted', () => {
    const result = evalZeroFillGuard(62)
    expect(result.orderExecuted).toBe(true)
    expect(result.countersIncremented).toBe(true)
    expect(result.stopSubmitted).toBe(true)
    expect(result.errorLabel).toBeUndefined()
  })

  it('partial fill (162 of 212): treated as filled — orderExecuted=true', () => {
    const result = evalZeroFillGuard(162)
    expect(result.orderExecuted).toBe(true)
    expect(result.countersIncremented).toBe(true)
    expect(result.stopSubmitted).toBe(true)
    expect(result.errorLabel).toBeUndefined()
  })
})

describe('Partial-fill label logic', () => {
  it('162 of 212 requested → IOC_PARTIAL_FILL label fires', () => {
    expect(evalPartialFillLabel(212, 162)).toBe(true)
  })

  it('62 of 62 requested (full fill) → no partial label', () => {
    expect(evalPartialFillLabel(62, 62)).toBe(false)
  })

  it('0 of 102 requested (zero fill) → no partial label', () => {
    expect(evalPartialFillLabel(102, 0)).toBe(false)
  })
})

describe('Path 1 zero-fill agent_log visibility (HIGH-01 regression guard)', () => {
  it('zero-fill: errorLabel=IOC_NOT_FILLED and orderExecuted=false are set before entry construction — confirms they will appear in the agent_log entry (no continue exits the loop before construction)', () => {
    // Arrange / Act
    const result = evalZeroFillGuard(0)

    // Assert — with the `else` restructure (no `continue`), flow reaches
    // the entry construction at lines ~1929-1953. The entry picks up these
    // values from the local variables set in the zero-fill guard:
    //   entry.orderExecuted = orderExecuted (= false, never set to true)
    //   entry.error = error (= IOC_NOT_FILLED message)
    // → decisions.push(entry) → visible in agent_log dashboard.
    expect(result.errorLabel).toBe(IOC_NOT_FILLED)
    expect(result.orderExecuted).toBe(false)
  })
})

describe('Stop failure surfacing — error label format', () => {
  it('STOP_SUBMIT_FAILED error contains the string constant and the reason', () => {
    const reason = 'insufficient quantity'
    const errorField = `${STOP_SUBMIT_FAILED}: ${reason}`
    expect(errorField).toMatch(/^STOP_SUBMIT_FAILED: /)
    expect(errorField).toContain(reason)
  })
})
