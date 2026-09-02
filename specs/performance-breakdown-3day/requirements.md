# Requirements — Add TREND_PULLBACK_3DAY to Performance API + Dashboard Breakdown

## Background (confirmed against current code, 2026-09-02)

- `src/app/api/performance/route.ts:59-71` builds `signalTypeBreakdown` from 5 hardcoded filters over `closedTrades` (`meanReversion`, `trend`, `trendPullback`, `trendZLE05`, `emaReclaim`). No filter or key exists for `signal_type === 'TREND_PULLBACK_3DAY'` — such trades match none of the 5 filters and are silently excluded from the response entirely (no "other" bucket).
- `signalStats()` (`route.ts:39-57`) takes an array of trades and returns `{ count, winRate, avgPnlPct, profitFactor, expectancy }`. It handles an empty input array gracefully (produces zeros for every field, no error).
- `src/components/dashboard/PerformanceAnalytics.tsx:87-93` declares a local, file-scoped `PerformanceData.signalTypeBreakdown` type (not shared with the backend or any other file):
  ```ts
  signalTypeBreakdown?: {
    meanReversion: SignalStat
    trend: SignalStat
    trendPullback?: SignalStat
    trendZLE05?: SignalStat
    emaReclaim: SignalStat
  }
  ```
- `PerformanceAnalytics.tsx:156-199` builds a `sigs` array from 4 individually-coded object literals (`MR`, `TREND_PULLBACK`, `TREND_ZLE05`, `EMA_RECLAIM` — the API's `trend` key is unused/dead on the frontend, out of scope here). This is **not** a generic loop over `signalTypeBreakdown`'s keys — adding a new API key alone would not surface anything in the UI without a matching new object literal. `trendPullback`/`trendZLE05` both use an unconditional-inclusion pattern (`?.` defaults to `0`, included in the array regardless of trade count, then the whole array is `.filter(s => s.trades > 0)`ed at the end, line 199) — this differs from `emaReclaim`'s inline-conditional-spread pattern (line 190).
- Neither `route.ts` nor `PerformanceAnalytics.tsx` has an existing test file (confirmed via repo-wide glob for `*performance*` and `*PerformanceAnalytics*` — no matches under `src/`).
- Both files are outside the Protected Zone; no special Amaury authorization is required beyond normal spec approval.

## Functional Requirements

FR-01: The system shall include a `signal_type === 'TREND_PULLBACK_3DAY'` trade in the API's `signalTypeBreakdown.trendPullback3Day` statistics.
FR-02: The system shall exclude a `TREND_PULLBACK_3DAY` trade from the `meanReversion`, `trend`, `trendPullback`, `trendZLE05`, and `emaReclaim` groupings.
FR-03: The system shall continue to compute the existing 5 `signalTypeBreakdown` keys using the same trade groupings as before this change.
FR-04: The system shall render a `TREND_PULLBACK_3DAY` entry in the dashboard's "By Signal Type" breakdown when at least one closed `TREND_PULLBACK_3DAY` trade exists.
FR-05: The system shall omit the `TREND_PULLBACK_3DAY` entry from the dashboard's "By Signal Type" breakdown while zero closed `TREND_PULLBACK_3DAY` trades exist (consistent with the existing behavior for `trendPullback`/`trendZLE05` when they have zero trades).
FR-06: The system shall continue to render the 4 existing signal-type entries exactly as before this change.

## Non-Functional Requirements

NFR-01: The dashboard's new `TREND_PULLBACK_3DAY` entry shall follow the same unconditional-inclusion-plus-trailing-filter pattern used by `trendPullback`/`trendZLE05`, not the inline-conditional-spread pattern used by `emaReclaim`.
NFR-02: The change shall not alter `signalStats()`'s implementation or its return shape.

## Constraints

C-01: Neither file touched is in the Protected Zone — no special Amaury confirmation beyond normal spec approval is required.
C-02: Do not modify the 4 existing filters (`mrTrades`, `trendPullbackTrades`, `trendZLE05Trades`, `emaReclaimTrades`) in `route.ts`.
C-03: Do not modify the `trend` key or its "backward compat — do not remove" comment in `route.ts`.
C-04: Do not modify `signalStats()` itself.
C-05: Do not modify the rendering/mapping logic in `PerformanceAnalytics.tsx` (the `.map()` over `sigs`, lines 244-265) — it already handles any array length generically.
C-06: Do not reorder or modify the 4 existing entries in the `sigs` array.
C-07: Do not modify `ui.tsx`, `report-generator.ts`, `db.ts`, `claude-agent.ts`, or any other file — each is a separately-scoped, already-identified follow-up.

## Out of Scope

- `ui.tsx`'s `SignalBadge` map — has no `TREND_PULLBACK_3DAY` entry either; a closed `TREND_PULLBACK_3DAY` trade will display correct stats under this fix but with a gray/neutral fallback badge showing the raw string `"TREND_PULLBACK_3DAY"` until that separate, later fix ships. This is expected, not a defect in this change.
- `report-generator.ts`'s weekly-PDF signal-type breakdown (same underlying gap, separately scoped).
- `db.ts`'s `as` type-cast unions.
- Any architectural change to how the dashboard's `sigs` array is built (e.g. converting it to a generic loop) — out of scope, a candidate for future consolidation.
