# Requirements — Fix Trade History (Alpaca orders → trade_evaluations)

## Functional Requirements

FR-01: The system shall serve Trade History data from the `trade_evaluations` Supabase table via `GET /api/trades`.

FR-02: The system shall return the 50 most recent closed trades, ordered by `sell_timestamp` descending.

FR-03: The system shall display one row per closed trade in TradeHistoryTable, where each row contains both entry and exit data.

FR-04: The system shall display the trade close date derived from `sellTimestamp` in each row.

FR-05: The system shall display the symbol in each row.

FR-06: The system shall display the signal type per trade using the existing `SignalBadge` component from `ui.tsx`.

FR-07: The system shall display the entry price (`buyPrice`) formatted as currency in each row.

FR-08: The system shall display the exit price (`sellPrice`) formatted as currency in each row.

FR-09: The system shall display the quantity in each row.

FR-10: The system shall display `pnlPct` formatted as a percentage in each row, colored green when positive and red when negative.

FR-11: The system shall display the outcome (`profit` / `loss` / `breakeven`) color-coded in each row.

FR-12: The system shall update the dashboard page to pass `TradeEvaluation[]` to `TradeHistoryTable` instead of `AlpacaOrder[]`.

## Non-Functional Requirements

NFR-01: Zero TypeScript errors after the change (`npm run build` passes clean).

NFR-02: No `AlpacaOrder` references shall remain in the three modified files.

## Constraints

C-01: `getTradeEvaluations()` in `src/lib/db.ts` must not be modified.

C-02: No other API routes, trading logic, or Protected Zone files may be touched.

C-03: `src/components/dashboard/ui.tsx` must not be modified — use `SignalBadge` as-is; it already accepts full `signal_type` strings (`TREND_PULLBACK`, `TREND_ZLE05`, `EMA_RECLAIM`, `MEAN_REVERSION`).

C-04: The `[TRADE_HISTORY]` diagnostic `console.log` removal is a no-op — no such log exists in the current codebase.

## Out of Scope

- Pagination or infinite scroll beyond the 50-row limit
- Sorting or filtering controls in the UI
- CSV export implementation (decorative button already present — leave as-is)
- Adding `holdingDays`, `pnlUSD`, or `claudePostMortem` columns
- Any changes to `PerformanceAnalytics` or other dashboard sections
- Changes to how open positions are displayed
