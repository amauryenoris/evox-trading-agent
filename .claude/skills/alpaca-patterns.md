# Alpaca API Patterns — Paquito

## Client (src/lib/alpaca.ts)

All Alpaca calls go through `src/lib/alpaca.ts`. Never call the Alpaca REST API directly from routes or components.

## Paper vs live trading

The project uses **paper trading** (`ALPACA_BASE_URL=https://paper-api.alpaca.markets`).
Paper and live use the same API surface — switching to live only requires changing the env var.
Never hardcode the base URL.

## Market closed handling

Always check `clock.is_open` before submitting orders. The agent cycle handles this:
- Market closed + no positions → skip cycle entirely
- Market closed + open positions → run exit evaluation only, skip BUY logic

```typescript
const clock = await getClock()
if (!clock.is_open) {
  console.log('[MODULE] Market closed — skipping')
  return
}
```

Do not submit orders when market is closed — Alpaca will reject them or queue them unexpectedly.

## Order types in use

| Type | Function | When used |
|------|----------|-----------|
| Limit IOC | `submitLimitOrder(symbol, qty, 'buy', ask)` | Entries — limit at ask price, immediate-or-cancel |
| Stop GTC | `submitStopOrder(symbol, qty, stopPrice)` | Stop loss on entry (Capa A protection) |
| Market | `closePosition(symbol)` | Exits — closes full position at market |

IOC orders may be `canceled` if no liquidity at ask. Always check `order.status`:

```typescript
const order = await submitLimitOrder(symbol, qty, 'buy', limitPrice)
if (order.status === 'canceled') {
  console.log(`[ORDER] ${symbol} IOC not filled — no liquidity at ask $${limitPrice}`)
  // Not an error — just no fill. Do not retry immediately.
}
```

## Quote freshness

Always check quote freshness before using it for spread gate or limit price:

```typescript
const quote = await getQuote(symbol)
if (!quote) { /* no quote available */ }
if (!quote.fresh) { /* stale quote — skip */ }
if (quote.spreadBps > MAX_SPREAD_BPS) { /* spread too wide — skip */ }
const limitPrice = quote.ask
```

`MAX_SPREAD_BPS = 50` (from `src/lib/config.ts`). Never hardcode.

## Numeric fields — always parseFloat

Alpaca returns monetary values as strings:

```typescript
const equity  = parseFloat(account.equity)
const cash    = parseFloat(account.cash)
const pnlPct  = parseFloat(position.unrealized_plpc)  // already a decimal: 0.05 = 5%
const price   = parseFloat(position.current_price)
```

## Bars / price history

```typescript
const bars = await getBars(symbol, '1Day', 300, 300)
// args: symbol, timeframe, limit, feed_delay_minutes
// Returns Bar[] sorted oldest → newest
// Need at least 30 bars for indicator calculations
if (bars.length < 30) { /* insufficient data — skip symbol */ }
```

## Error handling

Alpaca API errors are common in production (network issues, market edge cases).
Always wrap calls in try/catch and log with context. Never crash the cycle on a single symbol failure:

```typescript
try {
  await closePosition(symbol)
} catch (err) {
  console.error(`[EXIT-RULES] Failed to close ${symbol}:`, err)
  // Position may or may not be closed — detectClosedPositions() will reconcile next cycle
}
```

## Instrument blacklist

Always check `INSTRUMENT_BLACKLIST` before processing a symbol:

```typescript
import { INSTRUMENT_BLACKLIST } from './config'
if (INSTRUMENT_BLACKLIST.has(symbol)) {
  console.log(`[AGENT] ${symbol} skipped — blacklisted`)
  continue
}
```

The blacklist contains inverse ETFs and leveraged ETFs that distort Kalman filter signals.
