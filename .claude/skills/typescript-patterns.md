# TypeScript Patterns — Paquito / Next.js 16

## Core types (src/lib/types.ts — read before adding types)

Never duplicate types. The canonical types are already defined:
- `TechnicalIndicators` — all indicator fields (kalman, rsi, macd, bb, ema, adx, atr, etc.)
- `AgentDecision` — action, symbol, quantity, reasoning, confidence, learning_note, near_miss_score, what_would_trigger
- `AgentLogEntry` — id, timestamp, symbol, decision, indicators, portfolioSnapshot, orderExecuted, orderId, error
- `AlpacaAccount` — equity, cash, buying_power
- `AlpacaPosition` — symbol, qty, avg_entry_price, current_price, unrealized_pl, unrealized_plpc, market_value
- `OpenPositionContext` — symbol, buyTimestamp, buyPrice, quantity, indicators, signalType, trailingStop, etc.
- `TradeEvaluation`, `ThresholdMap`, `LearnContext`

## Async/await error handling

Always catch at the call site. Never let async errors bubble silently:

```typescript
// Good — explicit catch with fallback
const bars = await getBars(symbol, '1Day', 300, 300).catch((err) => {
  console.error(`[MODULE] Failed to fetch bars for ${symbol}:`, err)
  return [] as Bar[]
})

// Good — try/catch when you need to branch on the error
try {
  await closePosition(symbol)
} catch (err) {
  console.error(`[EXIT-RULES] Failed to close ${symbol}:`, err)
  // Do NOT rethrow if Alpaca already executed — log and continue
}
```

Never swallow errors silently (`catch(() => {})`). Always log with module prefix in brackets: `[MODULE]`.

## API route pattern (App Router)

```typescript
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const data = await fetchSomething()
    return NextResponse.json(data)
  } catch (err) {
    console.error('[API/route-name]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

## Alpaca response types

Parse numeric fields explicitly — Alpaca returns strings for monetary values:

```typescript
const equity = parseFloat(account.equity)           // string → number
const pnlPct = parseFloat(position.unrealized_plpc) // string → number
const price  = parseFloat(position.current_price)   // string → number
```

Never do arithmetic on raw Alpaca string fields. Always `parseFloat` first.

## Claude API response type

Claude returns `Anthropic.Message`. The decision JSON lives in `content[0]`:

```typescript
const content = response.content[0]
if (content.type !== 'text') throw new Error('Unexpected Claude response type')
const jsonText = content.text.replace(/```json\n?|\n?```/g, '').trim()
let decision: AgentDecision
try {
  decision = JSON.parse(jsonText) as AgentDecision
} catch {
  decision = { action: 'HOLD', symbol, quantity: 0, reasoning: 'Parse error', confidence: 0 }
}
```

## Env vars — always validate at startup

```typescript
const apiKey = process.env.ANTHROPIC_API_KEY
if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')
```

## Null safety on indicators

Most indicator fields are `number | null`. Always guard before use:

```typescript
const adx = indicators.adx ?? 0
const rsi = indicators.rsi ?? 50
if (indicators.kalman) {
  const zScore = indicators.kalman.zScore
}
```

## Signal type literal union

```typescript
type SignalType = 'MEAN_REVERSION' | 'TREND_PULLBACK' | 'TREND_ZLE05' | 'EMA_RECLAIM'
```

Use this instead of `string` whenever referring to a signal type.
