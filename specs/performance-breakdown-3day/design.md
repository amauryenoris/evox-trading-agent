# Design — Add TREND_PULLBACK_3DAY to Performance API + Dashboard Breakdown

## Architecture Decision

This spans two layers of the existing performance-reporting feature: the API aggregation layer (`src/app/api/performance/route.ts`, computes per-signal-type trade statistics server-side) and the dashboard presentation layer (`src/components/dashboard/PerformanceAnalytics.tsx`, a `'use client'` component that fetches and renders that response). Both already follow an established, repeated pattern for each of the 4 currently-displayed signal types (filter → `signalStats()` → API key; type field → object literal → `sigs` array entry). This change extends both layers by exactly one more instance of that same pattern — no new architecture, no new data flow shape.

## Data Flow

1. `GET /api/performance` loads `closedTrades` from `getTradeEvaluations()` (unchanged).
2. A new filter, `trendPullback3DayTrades = closedTrades.filter((t) => t.signal_type === 'TREND_PULLBACK_3DAY')`, added immediately after the existing `emaReclaimTrades` filter (`route.ts:65`).
3. `signalTypeBreakdown` gains a 6th key: `trendPullback3Day: signalStats(trendPullback3DayTrades)` (`route.ts:65-71`).
4. The JSON response now includes this key; `PerformanceAnalytics.tsx`'s `fetch(url).then((d: PerformanceData) => ...)` receives it as-is.
5. `PerformanceData.signalTypeBreakdown`'s local type (`PerformanceAnalytics.tsx:87-93`) gains a matching optional field, `trendPullback3Day?: SignalStat`, so the new key type-checks.
6. The `sigs` array (`PerformanceAnalytics.tsx:156-199`) gains a 5th object literal, inserted after the `TREND_ZLE05` entry and before the `EMA_RECLAIM` entry, using `?.` + `?? 0` against the new field (mirroring `trendPullback`/`trendZLE05`'s pattern) so it's unconditionally included in the array pre-filter.
7. The existing trailing `.filter((s) => s.trades > 0)` (line 199, unchanged) then hides the new entry whenever `trendPullback3Day.count === 0` — today (GOOGL still open, no closed `TREND_PULLBACK_3DAY` trades yet), and shows it automatically the moment a trade closes, with zero further code changes needed at that point.
8. The unchanged `.map()` over `sigs` (lines 244-265) renders whatever the array contains, including the new entry, using the existing `SignalBadge` (which will show a neutral fallback for this type — separately scoped, see Out of Scope) and `Progress` bar (using this entry's `color: 'green'`).

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Mirror the existing filter → `signalStats()` → API key + type field → `sigs` entry pattern exactly (as specified) | Zero new abstractions; consistent with how the 4 existing types were added; minimal, easily-reviewable diff across both files | Perpetuates the individually-coded, non-generic `sigs` array — a 7th future signal type will need the same manual addition again | Chosen — matches the explicitly scoped, narrow fix; refactoring `sigs` into a generic loop is called out as out of scope |
| Refactor the `sigs` array into a generic loop over `Object.entries(signalTypeBreakdown)` with a lookup table for labels/colors | Eliminates the "add a new object literal every time" maintenance burden going forward | Larger, riskier diff touching all 4 existing entries (violates "do not reorder or modify the 4 existing entries"); changes established, working code beyond what's needed to fix the reported bug | Rejected — explicitly out of scope per this task's constraints |
| Use `emaReclaim`'s inline-conditional-spread pattern instead of `trendPullback`/`trendZLE05`'s unconditional-inclusion pattern for the new entry | Marginally shorter | Inconsistent with the two closest-sibling trend-family entries; NFR-01 explicitly calls for matching those instead | Rejected — spec explicitly directs mirroring `trendPullback`/`trendZLE05` |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/app/api/performance/route.ts` | MODIFY | Add one filter (`trendPullback3DayTrades`) after the existing `emaReclaimTrades` line, and one key (`trendPullback3Day: signalStats(trendPullback3DayTrades)`) to the `signalTypeBreakdown` object. No other line changes. |
| `src/components/dashboard/PerformanceAnalytics.tsx` | MODIFY | (1) Add `trendPullback3Day?: SignalStat` to the local `PerformanceData.signalTypeBreakdown` type. (2) Add one object literal to the `sigs` array, positioned after the `TREND_ZLE05` entry and before the `EMA_RECLAIM` entry, following the `trendPullback`/`trendZLE05` unconditional-inclusion pattern. No other line changes. |

## Protected Zone Impact

None — neither `src/app/api/performance/route.ts` nor `src/components/dashboard/PerformanceAnalytics.tsx` is in the Protected Zone. No Amaury confirmation beyond normal spec review is required.

## Database Changes

None.

## Open Questions

None — this is a fully-specified, low-ambiguity change that mirrors an established, repeated pattern already present 4 times in the two touched files.
