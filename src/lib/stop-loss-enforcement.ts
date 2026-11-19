import { closePosition } from './alpaca'
import { getAllOpenPositionContexts } from './db'
import { upsertSymbolCooldown } from './db-cooldowns'
import type { AlpacaPosition } from './types'

// ============================================================
// STOP LOSS ENFORCEMENT (Capa B — manual safety check each cycle)
// ============================================================

export async function enforceStopLosses(positions: AlpacaPosition[], nextTradingDay3: Date | null): Promise<void> {
  const stopLossPct = parseFloat(process.env.STOP_LOSS_PCT ?? '0.05')
  let openContexts
  try {
    openContexts = await getAllOpenPositionContexts()
  } catch (err) {
    console.error('[enforceStopLosses] CRITICAL: Failed to fetch positions — stop losses NOT enforced:', err)
    return
  }

  for (const ctx of openContexts) {
    const alpacaPos = positions.find((p) => p.symbol === ctx.symbol)
    if (!alpacaPos) continue // already closed

    const currentPrice = parseFloat(alpacaPos.current_price)
    const stopPrice = ctx.buyPrice * (1 - stopLossPct)

    if (currentPrice <= stopPrice) {
      console.warn(`[enforceStopLosses] Stop triggered: ${ctx.symbol} @ $${currentPrice.toFixed(2)} <= stop $${stopPrice.toFixed(2)}`)
      try {
        await closePosition(ctx.symbol)
        if (nextTradingDay3 !== null) {
          await upsertSymbolCooldown(ctx.symbol, 'STOP_LOSS', nextTradingDay3)
          console.log(
            `[COOLDOWN_PERSIST] symbol=${ctx.symbol}` +
            ` reason=STOP_LOSS` +
            ` until=${nextTradingDay3.toISOString()}` +
            ` source=enforceStopLosses`
          )
        }
      } catch (err) {
        console.error(`[enforceStopLosses] Failed to close ${ctx.symbol}:`, err)
      }
    }
  }
}
