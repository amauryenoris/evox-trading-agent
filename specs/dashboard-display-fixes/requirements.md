# Requirements — Dashboard Display Fixes (Labels · Performance Breakdown · Trade History)

## Functional Requirements

### Fix 1 — Legacy Label Cleanup

FR-01: Where a signal badge renders a signal of type `TREND`, `TREND_FOLLOWING`, or `PULLBACK_EMA50`, the system shall display the label "Trend PB".

FR-02: Where a signal badge renders a signal of type `TREND_PULLBACK`, the system shall display the label "Trend PB".

FR-03: Where a signal badge renders a signal of type `TREND_ZLE05`, the system shall display the label "Trend ZLE".

FR-04: The system shall preserve all legacy signal-type keys (`TREND`, `TREND_FOLLOWING`, `PULLBACK_EMA50`) in display maps so that historical agent_log entries continue to render without falling back to the raw key string.

FR-05: The system shall apply FR-01 through FR-03 uniformly in both `AgentReasoningLog.tsx` and `ui.tsx` `SignalBadge` components.

### Fix 2 — Performance Breakdown by Setup

FR-06: The system shall compute and expose performance statistics (count, win rate, profit factor, expectancy) for `TREND_PULLBACK` trades as a separate key (`trendPullback`) in the `/api/performance` response.

FR-07: The system shall compute and expose performance statistics for `TREND_ZLE05` trades as a separate key (`trendZLE05`) in the `/api/performance` response.

FR-08: The system shall retain the existing combined `trend` key in the `/api/performance` response for backward compatibility; its value shall equal the union of `trendPullback` and `trendZLE05` trades.

FR-09: The system shall include legacy signal names `TREND`, `PULLBACK_EMA50`, and `TREND_FOLLOWING` in the `trendPullback` bucket so that any historical closed trades with those values are not silently excluded from statistics.

FR-10: The Performance Analytics "By Signal Type" section shall render a separate row for `TREND_PULLBACK` (label "Trend PB") and a separate row for `TREND_ZLE05` (label "Trend ZLE") in place of the current single "Trend" row.

FR-11: The system shall render the `TREND_ZLE05` row only when `trendZLE05.count > 0` (consistent with the existing `.filter((s) => s.trades > 0)` gate already in place).

FR-12: The system shall apply the same `trendPullback` / `trendZLE05` split in `report-generator.ts` so that PDF weekly reports reflect per-setup statistics.

FR-13: Where `signalStats` receives an empty array, the system shall return `{ count: 0, winRate: 0, avgPnlPct: 0, profitFactor: 0, expectancy: 0 }` — no NaN, no Infinity, no division-by-zero.

### Fix 3 — Trade History BUYs Not Showing

FR-14: The Trade History table shall render all filled orders returned by the API up to the full fetch limit, not a hard-coded slice of 20.

FR-15: The system shall emit a diagnostic log entry to the browser console on each Trade History render containing: total order count, and the side/symbol/submitted_at of the first 10 orders in the fetched list.

## Non-Functional Requirements

NFR-01: All changes shall be display-only; no trading logic, execution gate, position sizing, or exit rule shall be modified.

NFR-02: The `/api/performance` response shape change shall be additive only; no existing key shall be removed or renamed.

NFR-03: The `PerformanceAnalytics` component shall use optional chaining (`?.`) and nullish coalescing (`?? 0`) on all accesses to `trendPullback` and `trendZLE05` so that the component does not crash if the API response predates this change.

## Constraints

C-01: This feature must not modify any file in the Protected Zone (config.ts, claude-agent.ts, risk-manager.ts, indicators.ts, news-intelligence.ts, watchlist-monitor.ts, learning.ts).

C-02: No Supabase schema changes, DB migrations, or RLS policy changes are permitted.

C-03: The Alpaca fetch logic, sort direction (`direction=desc`), and API route (`/api/trades`) must not be changed.

C-04: The `trend` key in `signalTypeBreakdown` must not be removed (backward compatibility with existing PDF report consumers and any cached API clients).

## Out of Scope

- Paginating or pairing BUY/SELL orders in Trade History (deferred pending diagnostic log confirmation).
- Changing the Alpaca order fetch limit beyond removing the 20-item client-side cap.
- Adding EMA_RECLAIM as a new breakdown row (no data exists yet; existing conditional already handles this).
- Any change to the weekly report PDF layout beyond splitting the trend bucket.
- TypeScript type changes in `src/lib/types.ts`.
