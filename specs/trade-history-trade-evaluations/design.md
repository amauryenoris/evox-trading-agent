# Design — Fix Trade History (Alpaca orders → trade_evaluations)

## Architecture Decision

The fix lives entirely in the display layer. The API route swaps its data source from Alpaca (network call to broker) to Supabase (`trade_evaluations` table via the existing `getTradeEvaluations()` helper). The dashboard page updates its type annotation and prop name to match. The component replaces its `AlpacaOrder[]`-shaped render loop with a `TradeEvaluation[]`-shaped one. No new modules, no new types, no schema changes.

## Data Flow

```
Dashboard page (server component)
  │
  ├─ fetchJSON<TradeEvaluation[]>('/api/trades', [])
  │       ↓
  │  GET /api/trades  (route.ts)
  │       ↓
  │  getTradeEvaluations(50)  ← db.ts:261 (unchanged)
  │       ↓
  │  Supabase: trade_evaluations ORDER BY sell_timestamp DESC LIMIT 50
  │       ↓
  │  TradeEvaluation[]  (JSON response)
  │
  └─ <TradeHistoryTable trades={trades} />
         ↓
     One row per TradeEvaluation
     Date | Symbol | Signal | Entry | Exit | Qty | P&L% | Outcome
```

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Increase Alpaca slice to 200+ | Zero code change | Still fragile as trade count grows; no P&L or signal data; not scalable | Rejected |
| Pair BUY+SELL orders in route.ts | No Supabase dependency | O(n²) matching logic; fragile on partial fills; reinvents what trade_evaluations already is | Rejected |
| Use `trade_evaluations` via existing `getTradeEvaluations()` | Paired data with P&L, signal_type, outcome; already exists; bounded by row count not order recency | Requires updating 3 files | **Chosen** |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/app/api/trades/route.ts` | MODIFY | Replace `getOrders` import/call with `getTradeEvaluations`; remove Alpaca import |
| `src/components/dashboard/TradeHistoryTable.tsx` | MODIFY | Replace `AlpacaOrder[]` prop with `TradeEvaluation[]`; replace column render loop; import `SignalBadge` from `./ui` |
| `src/app/dashboard/page.tsx` | MODIFY | Change `fetchJSON<AlpacaOrder[]>` to `fetchJSON<TradeEvaluation[]>`; rename `trades` prop key from `orders` to `trades`; remove `AlpacaOrder` from import list |

## Protected Zone Impact

None — this feature does not require Protected Zone changes.

## Database Changes

None — `trade_evaluations` table already exists and is populated by the agent cycle.

## Open Questions

None — `SignalBadge` in `ui.tsx` already handles all four signal_type strings (`MEAN_REVERSION`, `TREND_PULLBACK`, `TREND_ZLE05`, `EMA_RECLAIM`) with full-string keys (verified at ui.tsx:91-94). No mapping layer needed.
