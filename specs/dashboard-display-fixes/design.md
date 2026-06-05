# Design — Dashboard Display Fixes (Labels · Performance Breakdown · Trade History)

## Architecture Decision

All three fixes live entirely in the presentation and API layer. No data is changed at rest. Fix 1 is pure client-side string mapping. Fix 2 adds two new keys to the `/api/performance` route (server-side compute over already-fetched `trade_evaluations`) and extends the `PerformanceData` interface consumed by `PerformanceAnalytics`. Fix 3 removes an arbitrary client-side slice cap in `TradeHistoryTable` and adds a diagnostic console log. No new routes, no new DB queries, no new components are required.

## Data Flow

### Fix 1 — Label Mapping

```
agent_log.signal_type (DB string)
  → AgentReasoningLog: enriched[].kind
      → SignalBadge map lookup → rendered label
  → ui.tsx SignalBadge: map[signal] → rendered label
```

The fix is a pure map-key extension in two files. The lookup path is unchanged.

### Fix 2 — Performance Breakdown Split

```
trade_evaluations (DB, via getTradeEvaluations)
  → /api/performance/route.ts
      filter: trendPullbackTrades  ← NEW (TREND | TREND_PULLBACK | PULLBACK_EMA50 | TREND_FOLLOWING)
      filter: trendZLE05Trades     ← NEW (TREND_ZLE05 only)
      filter: trendTrades          ← KEEP (union of above, backward compat)
      signalStats() per bucket
      → JSON response: { ...existing, trendPullback: SignalStat, trendZLE05: SignalStat }
  → PerformanceAnalytics (client fetch)
      PerformanceData.signalTypeBreakdown.trendPullback  ← NEW optional field
      PerformanceData.signalTypeBreakdown.trendZLE05     ← NEW optional field
      sigs[] array builds 4 rows: MR / Trend PB / Trend ZLE / EMA Reclaim
      → rendered "By Signal Type" section
```

```
trade_evaluations (DB, via report-generator)
  → report-generator.ts
      trendPullbackStats  ← NEW bucket
      trendZLE05Stats     ← NEW bucket
      → PDF weekly report (per-setup stats section)
```

### Fix 3 — Trade History Slice

```
/api/trades → getOrders('filled', 50) → AlpacaOrder[50]
  → DashboardPage fetchJSON('/api/trades')
      → TradeHistoryTable({ orders })
          console.log('[TRADE_HISTORY]', orders.length, first10)  ← NEW diagnostic
          const items = orders.slice(0, 50)   ← was slice(0, 20)
          → rendered table rows (all sides visible)
```

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Fix 2: Add `trendPullback`/`trendZLE05` as additive keys | Non-breaking; old consumers unaffected; component can use `?.` safely | Response payload grows slightly | **Chosen** |
| Fix 2: Replace `trend` key with two new keys | Cleaner schema | Breaks any existing consumer of the `trend` key (PDF renderer, cached clients) | Rejected |
| Fix 3: Increase Alpaca fetch limit to 100 | Shows more orders | Doesn't solve root cause if limit grows; server-side change | Deferred — diagnostic first |
| Fix 3: Sort by `filled_at` instead of `submitted_at` | Interleaves buys/sells more fairly | Requires API route change; `direction` param applies to `submitted_at` in Alpaca | Deferred |
| Fix 3: Pair BUY/SELL by client_order_id or symbol+date | Fully correct long-term display | Significant component rework; premature without diagnostic data | Out of scope for this spec |

## Impact on Existing Files

| File | Change Type | Description |
|------|-------------|-------------|
| [src/components/dashboard/AgentReasoningLog.tsx](src/components/dashboard/AgentReasoningLog.tsx) | MODIFY | Extend `SignalBadge` map lines 138–140: add `TREND_FOLLOWING`, `PULLBACK_EMA50`; update labels for `TREND`, `TREND_PULLBACK`, `TREND_ZLE05` |
| [src/components/dashboard/ui.tsx](src/components/dashboard/ui.tsx) | MODIFY | Extend `SignalBadge` map lines 88–90: add `TREND_FOLLOWING`, `PULLBACK_EMA50`; update labels |
| [src/app/api/performance/route.ts](src/app/api/performance/route.ts) | MODIFY | Split trend bucket into `trendPullback` + `trendZLE05`; keep `trend` for backward compat |
| [src/components/dashboard/PerformanceAnalytics.tsx](src/components/dashboard/PerformanceAnalytics.tsx) | MODIFY | Extend `PerformanceData` interface; replace single Trend row with two rows using `?.` access |
| [src/lib/report-generator.ts](src/lib/report-generator.ts) | MODIFY | Apply same `trendPullback`/`trendZLE05` split around line 291 |
| [src/components/dashboard/TradeHistoryTable.tsx](src/components/dashboard/TradeHistoryTable.tsx) | MODIFY | Add diagnostic `console.log`; change `slice(0, 20)` → `slice(0, 50)` |

## Protected Zone Impact

None — this feature does not require Protected Zone changes. The following files are untouched:
`config.ts`, `claude-agent.ts`, `risk-manager.ts`, `indicators.ts`, `news-intelligence.ts`, `watchlist-monitor.ts`, `learning.ts`.

## Database Changes

None. No new tables, columns, indexes, or RLS policies. All changes are computed over existing `trade_evaluations` data already fetched by `getTradeEvaluations`.

## Open Questions

None — all design decisions are resolved by the confirmed DB state (exactly 3 signal_type values, no bare `TREND` records) and the diagnostic-first approach for Fix 3.
