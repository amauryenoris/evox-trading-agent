# Tasks — Fix Trade History (Alpaca orders → trade_evaluations)

## Pre-Implementation

- [X] Amaury has reviewed and approved this spec
- [X] No Protected Zone changes required (confirmed)

## Implementation Checklist

### Phase 1 — API Route

- [x] T-01: In `src/app/api/trades/route.ts`, remove `import { getOrders } from '@/lib/alpaca'`.
- [x] T-02: Add `import { getTradeEvaluations } from '@/lib/db'`.
- [x] T-03: Replace `const orders = await getOrders('filled', 50)` with `const trades = await getTradeEvaluations(50)`.
- [x] T-04: Replace `return NextResponse.json(orders)` with `return NextResponse.json(trades)`.

### Phase 2 — Dashboard Page

- [x] T-05: In `src/app/dashboard/page.tsx`, change `fetchJSON<AlpacaOrder[]>('/api/trades', [])` to `fetchJSON<TradeEvaluation[]>('/api/trades', [])`.
- [x] T-06: Update `<TradeHistoryTable orders={trades} />` to `<TradeHistoryTable trades={trades} />`.
- [x] T-07: Remove `AlpacaOrder` from the type import at line 23 (if no longer used elsewhere in the file).
- [x] T-08: Add `TradeEvaluation` to the type import list (from `@/lib/types`).

### Phase 3 — TradeHistoryTable Component

- [x] T-09: In `src/components/dashboard/TradeHistoryTable.tsx`, remove `import type { AlpacaOrder } from '@/lib/types'`.
- [x] T-10: Import `TradeEvaluation` from `@/lib/types` and `SignalBadge` from `./ui`.
- [x] T-11: Change the `Props` interface: replace `orders: AlpacaOrder[]` with `trades: TradeEvaluation[]`.
- [x] T-12: Update function signature to destructure `{ trades }` instead of `{ orders }`.
- [x] T-13: Remove the `items = orders.slice(0, 50)` line — the API already limits to 50.
- [x] T-14: Replace table headers: `Time | Symbol | Side | Qty | Price | Total` → `Date | Symbol | Signal | Entry | Exit | Qty | P&L% | Outcome`.
- [x] T-15: Replace the row render loop to map over `trades` using `TradeEvaluation` fields:
  - `Date` — `t.sellTimestamp` formatted as `MMM D, YYYY` (ET timezone)
  - `Symbol` — `t.symbol`
  - `Signal` — `<SignalBadge signal={t.signal_type ?? null} />`
  - `Entry` — `t.buyPrice` as `$X.XX`
  - `Exit` — `t.sellPrice` as `$X.XX`
  - `Qty` — `t.quantity`
  - `P&L%` — `(t.pnlPct * 100).toFixed(2)%`, green (`text-green`) if positive, red (`text-red`) if negative
  - `Outcome` — `t.outcome` badge: profit → green, loss → red, breakeven → neutral

### Phase 4 — Verification

- [x] T-16: Run `npm run build` — zero TypeScript errors.
- [x] T-17: Confirm no `AlpacaOrder` references remain in the three modified files.

### Phase 5 — Testing

- [x] T-18: No new unit test required — `getTradeEvaluations` is already tested; the component change is display-only with no new branching logic beyond existing color conditionals.

## Post-Implementation

- [x] Run `/review trade-history-trade-evaluations` to verify implementation matches spec
- [x] Confirm only 3 files modified: `route.ts`, `page.tsx`, `TradeHistoryTable.tsx`

## Estimated Complexity

**Low** — 3 files, all display/wiring changes. No new logic, no schema changes, no new dependencies.
