# Design — TREND_PULLBACK_3DAY Dashboard Badge + Weekly Report Breakdown + db.ts Type-Safety Cleanup

## Architecture Decision

Three independent, unrelated pattern-completion fixes, bundled into one CHANGE because each mirrors work already merged this session for the same signal type: (1) `ui.tsx`'s `SignalBadge` is a pure presentation lookup, extended by one entry, same shape as the 4 prior CHANGEs' badge/constant additions. (2) `report-generator.ts`'s `calculateDiagnostics()` gains 2 more trade-filter/stats-key pairs, mirroring the exact pattern `route.ts` already had fixed (filter → stats function → object key), plus a necessary interface widening not in the original task prompt. (3) `db.ts`'s two type casts are widened for type accuracy only, with explicitly zero runtime behavior change.

## Data Flow

**1. `ui.tsx` (`SignalBadge`)**: `signal` prop → `map[signal]` lookup → `{ tone, label }` → `<Badge>`. Adding `TREND_PULLBACK_3DAY: { tone: 'green', label: 'Trend PB 3D' }` to `map` means a `TREND_PULLBACK_3DAY` position/trade now resolves through the map instead of falling to the `?? { tone: 'neutral', label: signal }` default at line 98. No caller of `SignalBadge` needs to change — `PositionsTable.tsx` and `PerformanceAnalytics.tsx` already pass the raw signal string through.

**2. `report-generator.ts` (`calculateDiagnostics()`)**:
- `weekEvals` (already computed, line 224) → 2 new filters (`emaReclaimTrades`, `trendPullback3DayTrades`) added after the existing `trendZLE05Trades` filter (line 323).
- Each new filter → `buildSignalStats()` (existing local function, line 309, unchanged) → 2 new keys (`emaReclaim`, `trendPullback3Day`) added to the `signalTypeBreakdown` object literal (lines 355-360).
- The `SignalTypeBreakdown` interface (lines 122-127) gains matching optional fields `emaReclaim?: SignalTypeStats` and `trendPullback3Day?: SignalTypeStats` — required so the object literal at 355-360 type-checks against `calculateDiagnostics()`'s declared `EnhancedDiagnostics` return type (line 154).
- **Stops here.** The PDF text-rendering section (lines 643-680) reads `diagnostics.signalTypeBreakdown` but only ever accesses `.meanReversion`, `.trendPullback`, `.trendZLE05` by name in `doc.text(...)` calls — it is explicitly out of scope to modify, so the new `emaReclaim`/`trendPullback3Day` values are computed and present on the object but never read or printed. The weekly PDF a user actually opens will not show these 2 signal types' stats after this CHANGE, even though the underlying `EnhancedDiagnostics` object now has correct data for them.

**3. `db.ts` (2 type casts)**: `row.signal_type` (an untyped Supabase column value, `unknown`/`string` at the DB layer) → `as '...' | '...' | ... | null` type assertion → `?? null`. Widening the union at lines 188 and 316 to include `'EMA_RECLAIM' | 'TREND_PULLBACK_3DAY'` does not change what value flows through (the assertion never validates, it only informs the type checker) — it only changes what TypeScript believes `signalType`/`signal_type` can be for any code downstream that pattern-matches or exhaustively switches on it.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Implement all 3 changes exactly as scoped in the task prompt, plus the necessary `SignalTypeBreakdown` interface widening the prompt omitted | Matches the prompt's intent; keeps `tsc` passing (a hard requirement the prompt itself states); minimal additional surface (1 interface, 2 fields) | None significant — this is a required correction, not a scope expansion | Chosen |
| Implement exactly as literally scoped, letting `tsc` fail on the interface mismatch, and report the failure | Follows the letter of "do not modify... any other part of the file" | Directly violates the prompt's own VERIFY requirement that `tsc --noEmit` must pass; produces a broken build for no benefit | Rejected — the interface widening is a necessary consequence of FR-03/FR-04, not an independent scope expansion, and the task prompt anticipated exactly this kind of discovery ("read the file first rather than assuming") |
| Also add the `doc.text()` rendering lines for `emaReclaim`/`trendPullback3Day` in the PDF output section, to fully close Goal #2 | Would make the weekly PDF actually show these 2 signal types, matching the dashboard | Explicitly forbidden by the task prompt's DO NOT CHANGE list ("any other part of the file beyond the 2 new filters and the 2 new keys"); expands scope beyond what was asked | Rejected — flagged as an Out of Scope item and a known, documented gap instead; a natural candidate for a follow-up CHANGE if Amaury wants full PDF parity |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/components/dashboard/ui.tsx` | MODIFY | Add one entry (`TREND_PULLBACK_3DAY: { tone: 'green', label: 'Trend PB 3D' }`) to `SignalBadge`'s `map` object (lines 83-97), after the `TREND_ZLE05` entry. No other line changes. |
| `src/lib/report-generator.ts` | MODIFY | (1) Add `emaReclaim?: SignalTypeStats` and `trendPullback3Day?: SignalTypeStats` to the `SignalTypeBreakdown` interface (lines 122-127). (2) Add 2 filters (`emaReclaimTrades`, `trendPullback3DayTrades`) after the existing `trendZLE05Trades` filter (line 323). (3) Add 2 keys (`emaReclaim`, `trendPullback3Day`) to the `signalTypeBreakdown` object literal (lines 355-360). No other line changes — PDF rendering section (643-680) and HOLDs Breakdown (229-274) untouched. |
| `src/lib/db.ts` | MODIFY | Widen the type-cast union at line 188 and, identically, at line 316, to add `'EMA_RECLAIM' | 'TREND_PULLBACK_3DAY'`. No other line changes. |

## Protected Zone Impact

None — none of `ui.tsx`, `report-generator.ts`, or `db.ts` is in the Protected Zone. No Amaury confirmation beyond normal spec review is required.

## Database Changes

None.

## Open Questions

- Confirm with Amaury: is it acceptable that this CHANGE computes correct `emaReclaim`/`trendPullback3Day` stats in `report-generator.ts`'s data object but does **not** make them appear in the actual printed weekly PDF (see Background/Data Flow for why) — or should the scope be expanded here to also add the corresponding `doc.text()` lines in the PDF rendering section, closing the gap fully in one pass instead of leaving it for a later CHANGE? Proceeding with the narrower, prompt-scoped version unless told otherwise.
- No open questions on the `ui.tsx` or `db.ts` portions — both are fully specified and low-ambiguity.
