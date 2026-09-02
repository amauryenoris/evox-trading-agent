# Tasks — Add TREND_PULLBACK_3DAY to Performance API + Dashboard Breakdown

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Protected Zone changes confirmed (if applicable) — N/A, neither file is in the Protected Zone
- [x] Database migrations drafted (if applicable) — N/A, none required

## Implementation Checklist

### Phase 1 — API aggregation layer
- [x] T-01: In `src/app/api/performance/route.ts`, add `const trendPullback3DayTrades = closedTrades.filter((t) => t.signal_type === 'TREND_PULLBACK_3DAY')` immediately after the existing `emaReclaimTrades` line (currently line 65).
- [x] T-02: Add `trendPullback3Day: signalStats(trendPullback3DayTrades),` as a new key in the `signalTypeBreakdown` object (currently lines 65-71), after `emaReclaim`, without changing the 5 existing keys, the `trend` key's backward-compat comment, or `signalStats()` itself.
- [x] T-03: Verify the 4 existing filters and the `trend`/`meanReversion`/`trendPullback`/`trendZLE05`/`emaReclaim` keys are byte-for-byte unchanged (diff review).

### Phase 2 — Dashboard presentation layer
- [x] T-04: In `src/components/dashboard/PerformanceAnalytics.tsx`, add `trendPullback3Day?: SignalStat` to the local `PerformanceData.signalTypeBreakdown` type (currently lines 87-93), following the same optional pattern as `trendPullback`/`trendZLE05`.
- [x] T-05: Add a new object literal to the `sigs` array (currently lines 156-199), positioned after the `TREND_ZLE05` entry and before the `EMA_RECLAIM` entry, with `type: 'TREND_PULLBACK_3DAY'`, `label: 'Trend PB 3-Day'`, `color: 'green' as SigColor`, and fields sourced via `data.signalTypeBreakdown.trendPullback3Day?.<field> ?? 0`, mirroring `trendPullback`/`trendZLE05`'s unconditional-inclusion pattern (not `emaReclaim`'s inline-conditional-spread).
- [x] T-06: Verify the 4 existing `sigs` entries are unchanged and unreordered, and that the rendering/mapping logic (lines 244-265) was not touched (diff review).

### Phase 3 — Verification
- [x] T-07: Run `npx tsc --noEmit` — must pass.
- [x] T-08: Run `npm run build` — must pass.
- [x] T-09: Run the full test suite (`npx vitest run`) — all existing tests must pass unmodified; report which test files ran (no existing test touches either file, per spec background).
- [x] T-10: Manually confirm (via a throwaway script — not a new permanent test file) that: (a) `signalTypeBreakdown` now has 6 keys with the 5 existing values unchanged for a representative trade set; (b) a trade with `signal_type === 'TREND_PULLBACK_3DAY'` lands only in the new `trendPullback3Day` bucket, not in `trend`/`trendPullback`/any other bucket; (c) the `sigs` array construction logic, given zero `TREND_PULLBACK_3DAY` trades, produces a `trendPullback3Day` entry with `trades: 0` that the trailing `.filter(s => s.trades > 0)` correctly excludes — and given one or more such trades, includes it.
- [x] T-11: Report the final line counts of both `route.ts` and `PerformanceAnalytics.tsx`.

## Post-Implementation

- [x] Run `/review performance-breakdown-3day` to verify implementation matches spec
- [x] Confirm exactly two files changed (this fix should touch only `route.ts` and `PerformanceAnalytics.tsx`)

## Estimated Complexity

Low — two small, well-isolated additions (one filter + one object key in the API; one type field + one array entry in the dashboard), each mirroring an established pattern already repeated 4 times across both files. No logic changes to shared functions, no Protected Zone involvement, no test regressions expected.
