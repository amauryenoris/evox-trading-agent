# Design — Fix P&L% ×100 Display Bug in TradeHistoryTable

## Architecture Decision

This is a one-line display-layer fix in a dashboard component (`src/components/dashboard/TradeHistoryTable.tsx`). No data-layer, API, or trading-logic change. The stored value is the source of truth and is already a percentage; the component must stop re-scaling it.

## Data Flow

```
learning.ts:65
  pnlPct = ((sellPrice - buyPrice) / buyPrice) * 100   ← percentage at write time
        │
        ▼
db.ts insertTradeEvaluation → trade_evaluations.pnl_pct   (e.g. -5.645)
        │
        ▼
db.ts getTradeEvaluations → TradeEvaluation.pnlPct        (passthrough, no scaling)
        │
        ├─► /api/performance → PerformanceAnalytics.tsx → fmtPct(n)         ✅ correct (no ×100)
        │
        └─► /api/trades → TradeHistoryTable.tsx
                line 43:  const pnlPct = t.pnlPct * 100                     ❌ BUG (double-scales)
                line 43′: const pnlPct = t.pnlPct                           ✅ FIX
```

Verified against live DB (2026-06-10):

| symbol | stored pnl_pct | current display (bug) | expected display (fix) |
|--------|----------------|----------------------|------------------------|
| NEM    | -5.6453984…    | -564.54%             | -5.65%                 |
| UUUU   | -6.1918511…    | -619.19%             | -6.19%                 |

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Remove ×100 in TradeHistoryTable | One line; aligns with every other consumer of this field | None | **Chosen** |
| Change learning.ts to store a fraction and keep ×100 in UI | Matches Alpaca `unrealized_plpc` convention | Touches Protected Zone (learning.ts); breaks PerformanceAnalytics, /api/performance, report-generator, stock-selector — all of which assume percentage; requires DB backfill | Rejected |
| Normalize in db.ts getTradeEvaluations | Single chokepoint | The value is already normalized — there is nothing to fix at that layer; risk of breaking correct consumers | Rejected |

## Impact on Existing Files

| File | Change Type | Description |
|------|-------------|-------------|
| src/components/dashboard/TradeHistoryTable.tsx | MODIFY | Line 43: `const pnlPct = t.pnlPct * 100` → `const pnlPct = t.pnlPct` |

No other file is modified.

## Protected Zone Impact

None — this feature does not require Protected Zone changes. `src/components/dashboard/**` is in the "touch freely" zone.

## Database Changes

None.

## Open Questions

None — the unit of `trade_evaluations.pnl_pct` was verified at the write site (learning.ts:65) and against live rows. Note for a future spec (not blocking): `agent_log.indicators.pnlPct` written at claude-agent.ts:981 uses a fraction (0.0565 = 5.65%), so the two tables use different units for the same field name. Out of scope here.
