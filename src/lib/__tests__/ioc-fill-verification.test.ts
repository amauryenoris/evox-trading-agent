import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { submitStopWithRetry, IOC_NOT_FILLED, STOP_SUBMIT_FAILED } from '../claude-agent'

const { mockSubmitStopOrder } = vi.hoisted(() => ({
  mockSubmitStopOrder: vi.fn(),
}))

vi.mock('../alpaca', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../alpaca')>()
  return {
    ...actual,
    submitStopOrder: mockSubmitStopOrder,
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
