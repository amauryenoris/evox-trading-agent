# Tasks — Dashboard Display Fixes (Labels · Performance Breakdown · Trade History)

## Pre-Implementation

- [X] Amaury has reviewed and approved this spec
- [x] Protected Zone changes confirmed: None required
- [x] Database migrations: None required

## Implementation Checklist

### Phase 1 — Prerequisite: Verify signalStats zero-safety

- [x] T-01: In `src/app/api/performance/route.ts`, read the `signalStats` function (lines ~39–56) and confirm that every numeric computation guards against empty-array division. Specifically: `wr` uses `trades.length > 0` guard ✓; `avgWP`/`avgLP` use `w.length > 0`/`l.length > 0` guards ✓; `pf` uses `tl > 0` guard ✓; `exp` is computed from `wr`/`lr` which are 0 when empty ✓. If any path produces NaN or Infinity, fix it before proceeding to T-02.

### Phase 2 — Fix 1: Legacy label cleanup

- [x] T-02: In `src/components/dashboard/AgentReasoningLog.tsx`, update the `SignalBadge` map (around lines 131–140):
  - Change `TREND_PULLBACK` label from `'TREND PB'` → `'Trend PB'`
  - Change `TREND_ZLE05` label from `'TREND ZLE'` → `'Trend ZLE'`
  - Change `TREND` label from `'TREND'` → `'Trend PB'` (keep same bg/text/border styles)
  - Add `TREND_FOLLOWING: { same styles as TREND, label: 'Trend PB' }`
  - Add `PULLBACK_EMA50:  { same styles as TREND, label: 'Trend PB' }`
  - Do not remove any existing key.

- [x] T-03: In `src/components/dashboard/ui.tsx`, update the `SignalBadge` map (around lines 88–90):
  - Change `TREND` label from `'TREND'` → `'Trend PB'`
  - Change `TREND_PULLBACK` label from `'TREND PB'` → `'Trend PB'` (if it differs)
  - Change `TREND_ZLE05` label from `'TREND ZLE'` → `'Trend ZLE'` (if it differs)
  - Add `TREND_FOLLOWING: { tone: 'green', label: 'Trend PB' }`
  - Add `PULLBACK_EMA50:  { tone: 'green', label: 'Trend PB' }`
  - Do not remove any existing key.

### Phase 3 — Fix 2: Performance breakdown split

- [x] T-04: In `src/app/api/performance/route.ts` (lines ~59–68), replace the single `trendTrades` filter and `signalTypeBreakdown` object with:
  - `trendPullbackTrades`: filter for `['TREND', 'TREND_PULLBACK', 'PULLBACK_EMA50', 'TREND_FOLLOWING']`
  - `trendZLE05Trades`: filter for `'TREND_ZLE05'` only
  - `signalTypeBreakdown`: keep existing `trend` key (= union of both); add `trendPullback` and `trendZLE05` keys

- [x] T-05: In `src/components/dashboard/PerformanceAnalytics.tsx`, extend the `PerformanceData` interface to add optional fields to `signalTypeBreakdown`:
  ```ts
  trendPullback?: SignalStat
  trendZLE05?:    SignalStat
  ```

- [x] T-06: In `src/components/dashboard/PerformanceAnalytics.tsx` (lines ~160–188), replace the single `TREND_PULLBACK` / "Trend" `sigs` entry with two entries using `?.` and `?? 0` on the new keys (as specified in the prompt). Remove the old single entry.

- [x] T-07: In `src/lib/report-generator.ts` (around line 291), apply the same split: add `trendPullbackStats` and `trendZLE05Stats` buckets using the same filter arrays as T-04. Keep the existing combined filter for the current `trendStats` variable if present; add per-setup stats alongside it. Update any PDF section that renders trend stats to show both rows separately.

### Phase 4 — Fix 3: Trade History diagnostic + slice increase

- [x] T-08: In `src/components/dashboard/TradeHistoryTable.tsx`, add a `console.log` immediately before the `items` declaration:
  ```ts
  console.log(
    '[TRADE_HISTORY]',
    orders.length,
    orders.slice(0, 10).map(o => ({ side: o.side, symbol: o.symbol, submitted_at: o.submitted_at }))
  )
  ```

- [x] T-09: In `src/components/dashboard/TradeHistoryTable.tsx`, change `orders.slice(0, 20)` to `orders.slice(0, 50)`.

### Phase 5 — TypeScript verification

- [x] T-10: Run `npm run build` and confirm zero TypeScript errors. Pay particular attention to: the extended `signalTypeBreakdown` interface, optional chaining on `trendPullback`/`trendZLE05`, and the `SignalBadge` map key additions.

### Phase 6 — Testing

- [x] T-11: Verify `signalStats([])` returns `{ count: 0, winRate: 0, avgPnlPct: 0, profitFactor: 0, expectancy: 0 }` — check manually or add an assertion.
- [x] T-12: Confirm no existing tests in `src/lib/__tests__/` fail after the changes (`npx vitest run`).
- [x] T-13: Note — no new unit tests are required by CLAUDE.md for pure display-layer changes with no new logic. The diagnostic log (T-08) is the verification mechanism for Fix 3.

## Post-Implementation

- [x] Run `/review dashboard-display-fixes` to verify implementation matches spec
- [x] Load the dashboard Analytics tab and confirm:
  - Signal badges show "Trend PB" for TREND_PULLBACK entries and "Trend ZLE" for TREND_ZLE05 entries in AgentReasoningLog
  - Performance "By Signal Type" shows 4 rows: Mean Reversion (7) · Trend PB (11) · Trend ZLE (4) · EMA Reclaim (0 — hidden)
  - `/api/performance` JSON response contains keys: `meanReversion`, `trend`, `trendPullback`, `trendZLE05`, `emaReclaim`
  - Browser console shows `[TRADE_HISTORY]` log with order count and first 10 orders including both sides
  - Trade History table shows both BUY and SELL rows
- [x] Confirm Protected Zone files unchanged: `git diff src/lib/config.ts src/lib/claude-agent.ts src/lib/risk-manager.ts src/lib/indicators.ts` shows no changes

## Estimated Complexity

**Low** — All changes are additive map entries and filter splits in 6 files. No new data sources, no new components, no schema changes. The only risk is the `PerformanceData` interface extension requiring careful optional chaining to avoid runtime errors on stale API responses.
