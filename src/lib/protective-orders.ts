import { randomUUID } from 'crypto'
import { cancelOrder, submitStopOrder, submitStopLimitOrder } from './alpaca'
import { updatePositionContext, updatePositionProtectiveStop, insertAgentLogEntry } from './db'
import { computeProtectiveStop, buildProtectiveStopSnapshot } from './protective-stop'
import type { AlpacaAccount, AlpacaPosition, OpenPositionContext, TechnicalIndicators } from './types'

// ============================================================
// PROTECTIVE ORDER HELPERS — trailing stop-limit and MEAN_REVERSION profit floor
// ============================================================

export interface ProtectiveOrderParams {
  position: AlpacaPosition
  ctx: OpenPositionContext
  ind: TechnicalIndicators
  account: AlpacaAccount
  positionCount: number
  timestamp: string
}

export interface ReplaceOrderParams extends ProtectiveOrderParams {
  targetStop: number
  // null submits a plain stop (market) order; a number submits a stop-limit with that limit
  limitPrice: number | null
}

export type ReplaceOutcome = 'skipped' | 'cancel_failed' | 'naked' | 'moved'

async function logNakedStopAlert(p: ProtectiveOrderParams, reasoning: string): Promise<void> {
  await insertAgentLogEntry({
    id: randomUUID(),
    timestamp: p.timestamp,
    symbol: p.position.symbol,
    decision: { action: 'HOLD', symbol: p.position.symbol, quantity: 0, reasoning, confidence: 0 },
    indicators: p.ind,
    portfolioSnapshot: { equity: p.account.equity, cash: p.account.cash, positionCount: p.positionCount },
    orderExecuted: false,
    error: 'trailing_stop_naked',
  }).catch((err) => console.error(`[EXIT-RULES] Failed to log trailing-stop naked alert for ${p.position.symbol}:`, err))
}

async function cancelRegisteredStop(orderId: string | null | undefined, symbol: string): Promise<string | null> {
  if (!orderId) return null
  try {
    await cancelOrder(orderId)
    return null
  } catch (err) {
    console.warn(`[TRAILING] Failed to cancel order ${orderId} for ${symbol}:`, err)
    return (err as Error).message ?? String(err)
  }
}

export async function replaceProtectiveOrder(
  p: ReplaceOrderParams
): Promise<{ outcome: ReplaceOutcome; stopOrderId: string | null }> {
  const { position, ctx, targetStop, limitPrice } = p
  if (!ctx.quantity) return { outcome: 'skipped', stopOrderId: null }

  const orderLabel = limitPrice === null ? 'profit-floor stop' : 'trailing stop-limit'
  const levels = limitPrice === null
    ? `$${targetStop.toFixed(2)}`
    : `$${targetStop.toFixed(2)}/limit $${limitPrice.toFixed(2)}`
  const cancellingCapaA = !ctx.trailingStopOrderId && !!ctx.stopOrderId
  const orderIdToCancel = cancellingCapaA ? ctx.stopOrderId : ctx.trailingStopOrderId

  const cancelError = await cancelRegisteredStop(orderIdToCancel, position.symbol)
  if (cancelError !== null) {
    await logNakedStopAlert(p, `EXIT-RULES: ${orderLabel} CANCEL FAILED for order ${orderIdToCancel} — new stop ${levels} not submitted — error: ${cancelError}`)
    return { outcome: 'cancel_failed', stopOrderId: ctx.trailingStopOrderId ?? null }
  }

  const replacement = limitPrice === null
    ? await submitStopWithRetry(position.symbol, ctx.quantity, targetStop)
    : await submitStopLimitWithRetry(position.symbol, ctx.quantity, targetStop, limitPrice)
  const newOrderId = replacement.stopOrderId ?? null

  const contextUpdates: Partial<OpenPositionContext> = { trailingStopOrderId: newOrderId }
  if (cancellingCapaA) contextUpdates.stopOrderId = null
  await updatePositionContext(position.symbol, contextUpdates).catch(
    (err: unknown) => console.error(`[EXIT-RULES] Failed to persist ${orderLabel} order id for ${position.symbol}:`, err)
  )

  if (newOrderId) return { outcome: 'moved', stopOrderId: newOrderId }
  await logNakedStopAlert(p, `EXIT-RULES: ${orderLabel} SUBMIT FAILED after cancelling ${orderIdToCancel ?? 'no prior order'} — attempted stop ${levels} — error: ${replacement.failureReason}`)
  return { outcome: 'naked', stopOrderId: null }
}

export interface ProfitFloorParams extends ProtectiveOrderParams {
  highSinceEntry: number
  currentPrice: number
  exitAlreadySet: boolean
}

export interface ProfitFloorOutcome {
  exitReason: string | null
  stopPrice: number | null
}

function logContextPersistError(symbol: string) {
  return (err: unknown) => console.error(`[EXIT-RULES] Failed to update profit floor context for ${symbol}:`, err)
}

async function persistProtectiveStopSnapshot(
  p: ProfitFloorParams,
  entry: number,
  stopPrice: number,
  stopOrderId: string | null
): Promise<void> {
  const snapshot = buildProtectiveStopSnapshot({
    setup: p.ctx.signalType,
    entry,
    high: p.highSinceEntry,
    stopPrice,
    stopOrderId,
    activatedAt: p.ctx.indicators?.protectiveStop?.activatedAt ?? p.timestamp,
  })
  if (!snapshot) return
  await updatePositionProtectiveStop(p.position.symbol, snapshot).catch(
    (err: unknown) => console.error(`[EXIT-RULES] Failed to persist protectiveStop for ${p.position.symbol}:`, err)
  )
}

export function resolveEntryPrice(position: AlpacaPosition, ctx: OpenPositionContext): number {
  const avgEntry = parseFloat(position.avg_entry_price)
  return avgEntry > 0 ? avgEntry : ctx.buyPrice
}

async function handleFloorSellNow(
  p: ProfitFloorParams,
  entry: number,
  stopPrice: number,
  activeState: Partial<OpenPositionContext>
): Promise<ProfitFloorOutcome> {
  await updatePositionContext(p.position.symbol, activeState).catch(logContextPersistError(p.position.symbol))
  const floorPct = ((stopPrice / entry) - 1) * 100
  const exitReason = p.exitAlreadySet
    ? null
    : `Exit rule: profit floor $${stopPrice.toFixed(2)} (+${floorPct.toFixed(2)}%) breached`
  return { exitReason, stopPrice }
}

export async function applyProfitFloor(p: ProfitFloorParams): Promise<ProfitFloorOutcome> {
  const { position, ctx, highSinceEntry } = p
  const symbol = position.symbol
  const entry = resolveEntryPrice(position, ctx)

  const result = computeProtectiveStop({
    setup: ctx.signalType,
    entry,
    high: highSinceEntry,
    current: p.currentPrice,
    existingStop: ctx.trailingStop ?? null,
  })

  if (!result.active || result.stopPrice === null) {
    await updatePositionContext(symbol, { highSinceEntry }).catch(logContextPersistError(symbol))
    return { exitReason: null, stopPrice: null }
  }

  const stopPrice = result.stopPrice
  const activeState = { highSinceEntry, trailingStop: stopPrice, trailingActivated: true }

  if (result.action === 'sell_now') return handleFloorSellNow(p, entry, stopPrice, activeState)

  const needsOrder = result.action !== 'none' || !ctx.trailingStopOrderId
  if (!needsOrder) {
    await updatePositionContext(symbol, activeState).catch(logContextPersistError(symbol))
    return { exitReason: null, stopPrice }
  }

  if (p.exitAlreadySet) {
    await updatePositionContext(symbol, { highSinceEntry }).catch(logContextPersistError(symbol))
    return { exitReason: null, stopPrice: ctx.trailingStop ?? null }
  }

  const move = await replaceProtectiveOrder({ ...p, targetStop: stopPrice, limitPrice: null })
  if (move.outcome === 'cancel_failed' || move.outcome === 'skipped') {
    await updatePositionContext(symbol, { highSinceEntry }).catch(logContextPersistError(symbol))
    return { exitReason: null, stopPrice: ctx.trailingStop ?? null }
  }

  await updatePositionContext(symbol, activeState).catch(logContextPersistError(symbol))
  await persistProtectiveStopSnapshot(p, entry, stopPrice, move.stopOrderId)
  return { exitReason: null, stopPrice }
}

// Submits a GTC stop order and retries once on failure.
// Returns the stop order ID on success, or a failureReason on double failure.
// The position context is always saved by the caller — a naked position
// is real and must be tracked even without stop protection.
export async function submitStopWithRetry(
  symbol: string,
  filledQty: number,
  stopPrice: number,
  retryDelayMs = 3000
): Promise<{ stopOrderId: string | undefined; failureReason: string | undefined }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const stopOrder = await submitStopOrder(symbol, filledQty, stopPrice)
      return { stopOrderId: stopOrder.id, failureReason: undefined }
    } catch (err) {
      if (attempt === 0) {
        console.warn(`[STOP] First attempt failed for ${symbol} — retrying in ${retryDelayMs}ms:`, err)
        await new Promise(r => setTimeout(r, retryDelayMs))
      } else {
        const reason = (err as Error).message ?? String(err)
        console.error(`[STOP] Retry also failed for ${symbol} — position is NAKED:`, reason)
        return { stopOrderId: undefined, failureReason: reason }
      }
    }
  }
  return { stopOrderId: undefined, failureReason: 'unreachable' }
}

export async function submitStopLimitWithRetry(
  symbol: string,
  filledQty: number,
  stopPrice: number,
  limitPrice: number,
  retryDelayMs = 3000
): Promise<{ stopOrderId: string | undefined; failureReason: string | undefined }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const order = await submitStopLimitOrder(symbol, filledQty, stopPrice, limitPrice)
      return { stopOrderId: order.id, failureReason: undefined }
    } catch (err) {
      if (attempt === 0) {
        console.warn(`[TRAILING] First stop-limit attempt failed for ${symbol} — retrying in ${retryDelayMs}ms:`, err)
        await new Promise(r => setTimeout(r, retryDelayMs))
      } else {
        const reason = (err as Error).message ?? String(err)
        console.error(`[TRAILING] Stop-limit retry also failed for ${symbol} — position is NAKED:`, reason)
        return { stopOrderId: undefined, failureReason: reason }
      }
    }
  }
  return { stopOrderId: undefined, failureReason: 'unreachable' }
}
