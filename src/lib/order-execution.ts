import { submitLimitOrder, getOrder, cancelOrder, getQuote } from './alpaca'
import { MAX_SPREAD_BPS } from './config'
import type { AlpacaOrder, FillAttempt } from './types'

// ============================================================
// IOC FILL — error label constants (greppable in agent_log)
// ============================================================

export const IOC_NOT_FILLED    = 'IOC_NOT_FILLED'
export const STOP_SUBMIT_FAILED = 'STOP_SUBMIT_FAILED'
export const IOC_LATE_FILL = 'IOC_LATE_FILL'

// Bounded remainder retry for a partial IOC BUY fill — never retries a zero fill.
export const IOC_REMAINDER_RETRY_MAX = 2
export const IOC_RETRY_MAX_DRIFT_BPS = 20
export const IOC_RETRY_MIN_REMAINDER_USD = 300

// Alpaca's IOC sync response is not guaranteed to reflect the final fill —
// the paper matching engine can resolve the order after the response is sent.
// Poll a bounded number of times whenever the sync response isn't definitively
// filled, to avoid orphan positions with no context or stop. If the order still
// hasn't reached a terminal status after polling, force resolution via cancel —
// an ambiguous snapshot is never returned as if it were final.
export async function resolveIocFinalState(
  syncOrder: AlpacaOrder,
  delayMs = 1500,
  maxAttempts = 4
): Promise<AlpacaOrder> {
  const syncFilled = parseInt(syncOrder.filled_qty, 10)
  if (syncOrder.status === 'filled' && syncFilled > 0) {
    return syncOrder
  }

  let order = syncOrder
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise(r => setTimeout(r, delayMs))
    order = await getOrder(syncOrder.id)
    const filled = parseInt(order.filled_qty, 10)

    if (order.status === 'filled' || order.status === 'canceled') {
      if (syncFilled === 0 && filled > 0) {
        console.log(
          `[ORDER] ${order.symbol} ${IOC_LATE_FILL}: sync=0 final=${filled}`
        )
      }
      return order
    }
  }

  console.log(
    `[ORDER] ${order.symbol} IOC_STATE_UNRESOLVED after ${maxAttempts} re-fetches — forcing cancel to obtain definitive final state`
  )
  try {
    await cancelOrder(syncOrder.id)
  } catch (err) {
    console.warn(`[ORDER] ${order.symbol} cancelOrder failed during forced IOC resolution:`, err)
  }
  return getOrder(syncOrder.id)
}

function buildFillAttempt(order: AlpacaOrder, qtyRequested: number, limitPrice: number): FillAttempt {
  const qtyFilled = parseInt(order.filled_qty, 10)
  let avgFillPrice: number | null = null
  if (qtyFilled > 0) {
    if (order.filled_avg_price) {
      avgFillPrice = parseFloat(order.filled_avg_price)
    } else {
      avgFillPrice = limitPrice
      console.warn(`[IOC_RETRY] ${order.symbol} order ${order.id} filled ${qtyFilled} but has no filled_avg_price — using limit price $${limitPrice} instead`)
    }
  }
  return { orderId: order.id, qtyRequested, qtyFilled, limitPrice, avgFillPrice, status: order.status }
}

function weightedAvgFillPrice(attempts: FillAttempt[], totalFilledQty: number): number | null {
  if (totalFilledQty === 0) return null
  const weightedSum = attempts.reduce((sum, a) => sum + (a.avgFillPrice ?? 0) * a.qtyFilled, 0)
  return weightedSum / totalFilledQty
}

// Runs the initial IOC BUY order, then bounded remainder retries on a
// partial fill only (never on a zero fill — see .claude/skills/alpaca-patterns.md).
// Each retry requires a fresh, non-stale, in-spread quote that hasn't drifted
// more than IOC_RETRY_MAX_DRIFT_BPS above attempt 1's price, and a remainder
// worth at least IOC_RETRY_MIN_REMAINDER_USD — any failing check simply stops
// the retries and keeps whatever already filled, it is never treated as an error.
export async function executeIocWithRemainderRetry(
  symbol: string,
  requestedQty: number,
  firstLimitPrice: number,
  firstSpreadBps: number
): Promise<{
  totalFilledQty: number
  avgFillPrice: number | null
  attempts: FillAttempt[]
  firstOrder: AlpacaOrder
}> {
  const firstSyncOrder = await submitLimitOrder(symbol, requestedQty, 'buy', firstLimitPrice)
  const firstOrder = await resolveIocFinalState(firstSyncOrder)
  const attempts: FillAttempt[] = [buildFillAttempt(firstOrder, requestedQty, firstLimitPrice)]
  let totalFilledQty = Math.min(attempts[0].qtyFilled, requestedQty)
  console.log(`[ORDER] ${symbol} limit IOC BUY @ $${firstLimitPrice} id: ${firstOrder.id} status: ${firstOrder.status} filled: ${totalFilledQty}/${requestedQty} spread: ${firstSpreadBps}bps`)

  if (totalFilledQty > 0) {
    for (let retry = 0; retry < IOC_REMAINDER_RETRY_MAX && totalFilledQty < requestedQty; retry++) {
      const remainder = requestedQty - totalFilledQty
      const freshQuote = await getQuote(symbol)
      const maxDriftPrice = firstLimitPrice * (1 + IOC_RETRY_MAX_DRIFT_BPS / 10000)
      const gateOk =
        freshQuote !== null &&
        freshQuote.fresh &&
        freshQuote.spreadBps <= MAX_SPREAD_BPS &&
        freshQuote.ask <= maxDriftPrice &&
        remainder * freshQuote.ask >= IOC_RETRY_MIN_REMAINDER_USD

      if (!gateOk) {
        console.log(`[IOC_RETRY] ${symbol} stopping remainder retries — gate check failed (remainder=${remainder})`)
        break
      }

      try {
        const retrySyncOrder = await submitLimitOrder(symbol, remainder, 'buy', freshQuote.ask)
        const retryOrder = await resolveIocFinalState(retrySyncOrder)
        const attempt = buildFillAttempt(retryOrder, remainder, freshQuote.ask)
        attempts.push(attempt)
        totalFilledQty = Math.min(totalFilledQty + attempt.qtyFilled, requestedQty)
        console.log(`[ORDER] ${symbol} limit IOC BUY retry @ $${freshQuote.ask} id: ${retryOrder.id} status: ${retryOrder.status} filled: ${attempt.qtyFilled}/${remainder} spread: ${freshQuote.spreadBps}bps`)
        if (attempt.qtyFilled === 0) {
          console.log(`[IOC_RETRY] ${symbol} stopping remainder retries — retry filled 0 shares`)
          break
        }
      } catch (err) {
        console.error(`[IOC_RETRY] ${symbol} retry attempt failed — keeping fills already obtained:`, err)
        break
      }
    }
  }

  console.log(`[IOC_REMAINDER_RETRY] ${symbol}: requested ${requestedQty}, attempts ${attempts.length}, filled ${totalFilledQty}`)

  return {
    totalFilledQty,
    avgFillPrice: weightedAvgFillPrice(attempts, totalFilledQty),
    attempts,
    firstOrder,
  }
}
