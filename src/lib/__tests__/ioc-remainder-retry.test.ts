import { describe, it, expect, vi } from 'vitest'

// Replicates executeIocWithRemainderRetry() and its buildFillAttempt() /
// weightedAvgFillPrice() helpers from claude-agent.ts (the block inserted
// next to resolveIocFinalState()). Kept in sync manually — update this file
// if that block's logic changes.

const IOC_REMAINDER_RETRY_MAX = 2
const IOC_RETRY_MAX_DRIFT_BPS = 20
const IOC_RETRY_MIN_REMAINDER_USD = 300
const MAX_SPREAD_BPS = 100

interface FillAttempt {
  orderId: string
  qtyRequested: number
  qtyFilled: number
  limitPrice: number
  avgFillPrice: number | null
  status: string
}

interface MockOrder {
  id: string
  filled_qty: string
  filled_avg_price: string | null
  status: string
}

interface MockQuote {
  ask: number
  spreadBps: number
  fresh: boolean
}

function buildFillAttempt(order: MockOrder, qtyRequested: number, limitPrice: number): FillAttempt {
  const qtyFilled = parseInt(order.filled_qty, 10)
  let avgFillPrice: number | null = null
  if (qtyFilled > 0) {
    avgFillPrice = order.filled_avg_price ? parseFloat(order.filled_avg_price) : limitPrice
  }
  return { orderId: order.id, qtyRequested, qtyFilled, limitPrice, avgFillPrice, status: order.status }
}

function weightedAvgFillPrice(attempts: FillAttempt[], totalFilledQty: number): number | null {
  if (totalFilledQty === 0) return null
  const weightedSum = attempts.reduce((sum, a) => sum + (a.avgFillPrice ?? 0) * a.qtyFilled, 0)
  return weightedSum / totalFilledQty
}

interface RetryDeps {
  submitAndResolve: (qty: number, price: number) => Promise<MockOrder>
  getQuote: () => Promise<MockQuote | null>
}

async function executeIocWithRemainderRetry(
  requestedQty: number,
  firstLimitPrice: number,
  deps: RetryDeps
): Promise<{ totalFilledQty: number; avgFillPrice: number | null; attempts: FillAttempt[]; firstOrder: MockOrder }> {
  const firstOrder = await deps.submitAndResolve(requestedQty, firstLimitPrice)
  const attempts: FillAttempt[] = [buildFillAttempt(firstOrder, requestedQty, firstLimitPrice)]
  let totalFilledQty = Math.min(attempts[0].qtyFilled, requestedQty)

  if (totalFilledQty > 0) {
    for (let retry = 0; retry < IOC_REMAINDER_RETRY_MAX && totalFilledQty < requestedQty; retry++) {
      const remainder = requestedQty - totalFilledQty
      const freshQuote = await deps.getQuote()
      const maxDriftPrice = firstLimitPrice * (1 + IOC_RETRY_MAX_DRIFT_BPS / 10000)
      const gateOk =
        freshQuote !== null &&
        freshQuote.fresh &&
        freshQuote.spreadBps <= MAX_SPREAD_BPS &&
        freshQuote.ask <= maxDriftPrice &&
        remainder * freshQuote.ask >= IOC_RETRY_MIN_REMAINDER_USD

      if (!gateOk) break

      try {
        const retryOrder = await deps.submitAndResolve(remainder, freshQuote!.ask)
        const attempt = buildFillAttempt(retryOrder, remainder, freshQuote!.ask)
        attempts.push(attempt)
        totalFilledQty = Math.min(totalFilledQty + attempt.qtyFilled, requestedQty)
        if (attempt.qtyFilled === 0) break
      } catch {
        break
      }
    }
  }

  return {
    totalFilledQty,
    avgFillPrice: weightedAvgFillPrice(attempts, totalFilledQty),
    attempts,
    firstOrder,
  }
}

function order(overrides: Partial<MockOrder> = {}): MockOrder {
  return { id: 'ord-1', filled_qty: '0', filled_avg_price: null, status: 'canceled', ...overrides }
}

function freshQuote(overrides: Partial<MockQuote> = {}): MockQuote {
  return { ask: 100, spreadBps: 10, fresh: true, ...overrides }
}

describe('executeIocWithRemainderRetry — full fill on attempt 1', () => {
  it('does not retry and records exactly one attempt', async () => {
    // Arrange
    const submitAndResolve = vi.fn().mockResolvedValue(order({ id: 'ord-1', filled_qty: '100', filled_avg_price: '100.00', status: 'filled' }))
    const getQuote = vi.fn()

    // Act
    const result = await executeIocWithRemainderRetry(100, 100, { submitAndResolve, getQuote })

    // Assert
    expect(result.totalFilledQty).toBe(100)
    expect(result.attempts).toHaveLength(1)
    expect(submitAndResolve).toHaveBeenCalledTimes(1)
    expect(getQuote).not.toHaveBeenCalled()
  })
})

describe('executeIocWithRemainderRetry — partial then full', () => {
  it('aggregates 2 attempts with correct qtyRequested/qtyFilled', async () => {
    // Arrange
    const submitAndResolve = vi.fn()
      .mockResolvedValueOnce(order({ id: 'ord-1', filled_qty: '60', filled_avg_price: '100.00', status: 'canceled' }))
      .mockResolvedValueOnce(order({ id: 'ord-2', filled_qty: '40', filled_avg_price: '100.10', status: 'filled' }))
    const getQuote = vi.fn().mockResolvedValue(freshQuote())

    // Act
    const result = await executeIocWithRemainderRetry(100, 100, { submitAndResolve, getQuote })

    // Assert
    expect(result.totalFilledQty).toBe(100)
    expect(result.attempts).toHaveLength(2)
    expect(result.attempts[0]).toMatchObject({ qtyRequested: 100, qtyFilled: 60 })
    expect(result.attempts[1]).toMatchObject({ qtyRequested: 40, qtyFilled: 40 })
  })
})

describe('executeIocWithRemainderRetry — partial then zero-fill retry', () => {
  it('keeps the first partial fill and stops after the zero-fill retry', async () => {
    // Arrange
    const submitAndResolve = vi.fn()
      .mockResolvedValueOnce(order({ id: 'ord-1', filled_qty: '60', filled_avg_price: '100.00', status: 'canceled' }))
      .mockResolvedValueOnce(order({ id: 'ord-2', filled_qty: '0', filled_avg_price: null, status: 'canceled' }))
    const getQuote = vi.fn().mockResolvedValue(freshQuote())

    // Act
    const result = await executeIocWithRemainderRetry(100, 100, { submitAndResolve, getQuote })

    // Assert
    expect(result.totalFilledQty).toBe(60)
    expect(result.attempts).toHaveLength(2)
    expect(result.attempts[1].qtyFilled).toBe(0)
    expect(submitAndResolve).toHaveBeenCalledTimes(2)
  })
})

describe('executeIocWithRemainderRetry — drift above tolerance', () => {
  it('does not retry when the fresh ask drifted beyond IOC_RETRY_MAX_DRIFT_BPS', async () => {
    // Arrange
    const submitAndResolve = vi.fn()
      .mockResolvedValueOnce(order({ id: 'ord-1', filled_qty: '60', filled_avg_price: '100.00', status: 'canceled' }))
    // firstLimitPrice=100, max allowed = 100 * 1.0020 = 100.20 — this ask exceeds it
    const getQuote = vi.fn().mockResolvedValue(freshQuote({ ask: 100.30 }))

    // Act
    const result = await executeIocWithRemainderRetry(100, 100, { submitAndResolve, getQuote })

    // Assert
    expect(result.totalFilledQty).toBe(60)
    expect(result.attempts).toHaveLength(1)
    expect(submitAndResolve).toHaveBeenCalledTimes(1)
  })
})

describe('executeIocWithRemainderRetry — remainder below minimum notional', () => {
  it('does not retry when remainder * ask < IOC_RETRY_MIN_REMAINDER_USD', async () => {
    // Arrange: remainder = 2 shares * $100 = $200, below the $300 minimum
    const submitAndResolve = vi.fn()
      .mockResolvedValueOnce(order({ id: 'ord-1', filled_qty: '98', filled_avg_price: '100.00', status: 'canceled' }))
    const getQuote = vi.fn().mockResolvedValue(freshQuote({ ask: 100 }))

    // Act
    const result = await executeIocWithRemainderRetry(100, 100, { submitAndResolve, getQuote })

    // Assert
    expect(result.totalFilledQty).toBe(98)
    expect(result.attempts).toHaveLength(1)
    expect(submitAndResolve).toHaveBeenCalledTimes(1)
  })
})

describe('executeIocWithRemainderRetry — attempts cap', () => {
  it('attempts exactly IOC_REMAINDER_RETRY_MAX retries when still partial after each one', async () => {
    // Arrange
    const submitAndResolve = vi.fn()
      .mockResolvedValueOnce(order({ id: 'ord-1', filled_qty: '10', filled_avg_price: '100.00', status: 'canceled' }))
      .mockResolvedValueOnce(order({ id: 'ord-2', filled_qty: '10', filled_avg_price: '100.05', status: 'canceled' }))
      .mockResolvedValueOnce(order({ id: 'ord-3', filled_qty: '10', filled_avg_price: '100.10', status: 'canceled' }))
    const getQuote = vi.fn().mockResolvedValue(freshQuote())

    // Act
    const result = await executeIocWithRemainderRetry(100, 100, { submitAndResolve, getQuote })

    // Assert — attempt 1 + IOC_REMAINDER_RETRY_MAX (2) retries = 3 total
    expect(submitAndResolve).toHaveBeenCalledTimes(1 + IOC_REMAINDER_RETRY_MAX)
    expect(result.attempts).toHaveLength(1 + IOC_REMAINDER_RETRY_MAX)
    expect(result.totalFilledQty).toBe(30)
  })
})

describe('executeIocWithRemainderRetry — retry throws', () => {
  it('preserves fills already obtained and keeps earlier attempts intact', async () => {
    // Arrange
    const submitAndResolve = vi.fn()
      .mockResolvedValueOnce(order({ id: 'ord-1', filled_qty: '60', filled_avg_price: '100.00', status: 'canceled' }))
      .mockRejectedValueOnce(new Error('network error'))
    const getQuote = vi.fn().mockResolvedValue(freshQuote())

    // Act
    const result = await executeIocWithRemainderRetry(100, 100, { submitAndResolve, getQuote })

    // Assert
    expect(result.totalFilledQty).toBe(60)
    expect(result.attempts).toHaveLength(1)
    expect(result.attempts[0]).toMatchObject({ orderId: 'ord-1', qtyFilled: 60 })
  })
})

describe('executeIocWithRemainderRetry — zero fill on attempt 1', () => {
  it('never enters the retry loop', async () => {
    // Arrange
    const submitAndResolve = vi.fn().mockResolvedValue(order({ id: 'ord-1', filled_qty: '0', filled_avg_price: null, status: 'canceled' }))
    const getQuote = vi.fn()

    // Act
    const result = await executeIocWithRemainderRetry(100, 100, { submitAndResolve, getQuote })

    // Assert
    expect(result.totalFilledQty).toBe(0)
    expect(result.attempts).toHaveLength(1)
    expect(submitAndResolve).toHaveBeenCalledTimes(1)
    expect(getQuote).not.toHaveBeenCalled()
  })
})

describe('executeIocWithRemainderRetry — weighted avgFillPrice', () => {
  it('computes the fill-quantity-weighted average across attempts', async () => {
    // Arrange: 60 @ 100.00 + 40 @ 100.50 → (60*100 + 40*100.5) / 100 = 100.20
    const submitAndResolve = vi.fn()
      .mockResolvedValueOnce(order({ id: 'ord-1', filled_qty: '60', filled_avg_price: '100.00', status: 'canceled' }))
      .mockResolvedValueOnce(order({ id: 'ord-2', filled_qty: '40', filled_avg_price: '100.50', status: 'filled' }))
    const getQuote = vi.fn().mockResolvedValue(freshQuote())

    // Act
    const result = await executeIocWithRemainderRetry(100, 100, { submitAndResolve, getQuote })

    // Assert
    expect(result.avgFillPrice).toBeCloseTo(100.2, 5)
  })

  it('returns null when nothing filled at all', async () => {
    // Arrange
    const submitAndResolve = vi.fn().mockResolvedValue(order({ id: 'ord-1', filled_qty: '0', filled_avg_price: null, status: 'canceled' }))
    const getQuote = vi.fn()

    // Act
    const result = await executeIocWithRemainderRetry(100, 100, { submitAndResolve, getQuote })

    // Assert
    expect(result.avgFillPrice).toBeNull()
  })

  it('falls back to limit price when a filled order lacks filled_avg_price', async () => {
    // Arrange
    const submitAndResolve = vi.fn().mockResolvedValue(order({ id: 'ord-1', filled_qty: '100', filled_avg_price: null, status: 'filled' }))
    const getQuote = vi.fn()

    // Act
    const result = await executeIocWithRemainderRetry(100, 100, { submitAndResolve, getQuote })

    // Assert
    expect(result.avgFillPrice).toBe(100)
  })
})

// Replicates the buyPrice resolution added inline at both saveOpenPositionContext call sites
// in claude-agent.ts (~2386, ~2591). Kept in sync manually — update this if that expression changes.
function resolveBuyPrice(avgFillPrice: number | null, currentPrice: number): number {
  return avgFillPrice !== null && Number.isFinite(avgFillPrice) && avgFillPrice > 0
    ? avgFillPrice
    : currentPrice
}

describe('resolveBuyPrice — buyPrice resolution at the saveOpenPositionContext call sites', () => {
  it('uses the fill price on a single full fill, not the quote/currentPrice', () => {
    // Arrange / Act
    const buyPrice = resolveBuyPrice(100.00, 99.50)

    // Assert
    expect(buyPrice).toBe(100.00)
  })

  it('uses the weighted average fill price from a retry sequence (41 @ 113.78 + 7 @ 113.77)', async () => {
    // Arrange
    const submitAndResolve = vi.fn()
      .mockResolvedValueOnce(order({ id: 'ord-1', filled_qty: '41', filled_avg_price: '113.78', status: 'canceled' }))
      .mockResolvedValueOnce(order({ id: 'ord-2', filled_qty: '7', filled_avg_price: '113.77', status: 'filled' }))
    const getQuote = vi.fn().mockResolvedValue(freshQuote({ ask: 114.50 }))
    const staleQuoteCurrentPrice = 113.5
    const expectedWeightedAvg = (41 * 113.78 + 7 * 113.77) / 48

    // Act
    const fillResult = await executeIocWithRemainderRetry(48, 114.50, { submitAndResolve, getQuote })
    const buyPrice = resolveBuyPrice(fillResult.avgFillPrice, staleQuoteCurrentPrice)

    // Assert
    expect(fillResult.avgFillPrice).toBeCloseTo(expectedWeightedAvg, 5)
    expect(buyPrice).toBeCloseTo(expectedWeightedAvg, 5)
    expect(buyPrice).not.toBe(staleQuoteCurrentPrice)
  })

  it('falls back to the supplied current price when avgFillPrice is null', () => {
    // Arrange / Act
    const buyPrice = resolveBuyPrice(null, 99.50)

    // Assert
    expect(buyPrice).toBe(99.50)
  })

  it('falls back to the supplied current price when avgFillPrice is 0 or not finite', () => {
    // Arrange / Act / Assert
    expect(resolveBuyPrice(0, 99.50)).toBe(99.50)
    expect(resolveBuyPrice(Number.POSITIVE_INFINITY, 99.50)).toBe(99.50)
    expect(resolveBuyPrice(Number.NaN, 99.50)).toBe(99.50)
  })
})
