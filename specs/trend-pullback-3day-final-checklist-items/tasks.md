# Tasks — TREND_PULLBACK_3DAY Dashboard Badge + Weekly Report Breakdown + db.ts Type-Safety Cleanup

## Pre-Implementation

- [X] Amaury has reviewed and approved this spec
- [x] Amaury has answered the Open Question in `design.md` (full PDF rendering parity now vs. later CHANGE) — proceeding with the narrower, prompt-scoped version (data computed, not yet rendered in PDF text) unless told otherwise
- [X] Protected Zone changes confirmed (if applicable) — N/A, none of the three files are in the Protected Zone
- [X] Database migrations drafted (if applicable) — N/A, none required

## Implementation Checklist

### Phase 1 — Dashboard badge (ui.tsx)
- [x] T-01: In `src/components/dashboard/ui.tsx`, add `TREND_PULLBACK_3DAY: { tone: 'green', label: 'Trend PB 3D' },` to `SignalBadge`'s `map` object (currently lines 83-97), after the `TREND_ZLE05` entry.
- [x] T-02: Verify the other 13 existing `map` entries are byte-for-byte unchanged (diff review).

### Phase 2 — Weekly report breakdown (report-generator.ts)
- [x] T-03: Add `emaReclaim?: SignalTypeStats` and `trendPullback3Day?: SignalTypeStats` to the `SignalTypeBreakdown` interface (currently lines 122-127) — required for T-05's object literal to type-check; not in the original task prompt's CHANGE list but necessary per this spec's Background/NFR-01.
- [x] T-04: Add `const emaReclaimTrades = weekEvals.filter((e) => e.signal_type === 'EMA_RECLAIM')` and `const trendPullback3DayTrades = weekEvals.filter((e) => e.signal_type === 'TREND_PULLBACK_3DAY')` immediately after the existing `trendZLE05Trades` filter (currently line 323).
- [x] T-05: Add `emaReclaim: buildSignalStats(emaReclaimTrades),` and `trendPullback3Day: buildSignalStats(trendPullback3DayTrades),` to the `signalTypeBreakdown` object literal (currently lines 355-360), using the file's actual local function `buildSignalStats()` (confirmed by name during spec research — not `signalStats`, which belongs to a different file).
- [x] T-06: Verify the 3 existing filters, the `trend` key's composition, `buildSignalStats()` itself, the HOLDs Breakdown section (lines 229-274), and the PDF text-rendering section (lines 643-680) are all byte-for-byte unchanged (diff review).

### Phase 3 — db.ts type-safety cleanup
- [x] T-07: In `src/lib/db.ts`, widen the type-cast union at line 188 to `'MEAN_REVERSION' | 'TREND' | 'TREND_PULLBACK' | 'TREND_ZLE05' | 'EMA_RECLAIM' | 'TREND_PULLBACK_3DAY' | null`.
- [x] T-08: Apply the identical widening to the type-cast union at line 316.
- [x] T-09: Search the repo for any other occurrence of the stale 4-member union pattern beyond these two named sites (confirmed via spec research to be none, but re-verify live at implementation time) — report if a third is found rather than silently leaving it unfixed.
- [x] T-10: Verify no `db.ts` function body was modified — only the two type-cast expressions (diff review).

### Phase 4 — Verification
- [x] T-11: Run `npx tsc --noEmit` — must pass (this is the check that confirms T-03's interface widening was necessary and sufficient).
- [x] T-12: Run `npm run build` — must pass.
- [x] T-13: Run the full test suite (`npx vitest run`) — all existing tests must pass unmodified; report which test files ran. Confirm `outcome-classification.test.ts` (the one file whose comment references `buildSignalStats`/`signalStats` by name) is unaffected, since it doesn't import either function.
- [x] T-14: Manually confirm (via a throwaway script — not a new permanent test file) that: (a) `SignalBadge`'s `map` now has 14 entries with a `TREND_PULLBACK_3DAY` key resolving to `{ tone: 'green', label: 'Trend PB 3D' }` instead of the neutral fallback; (b) `report-generator.ts`'s `signalTypeBreakdown` construction now produces 6 keys for a representative trade set, with `meanReversion`/`trend`/`trendPullback`/`trendZLE05` computed identically to before and `emaReclaim`/`trendPullback3Day` correctly isolated to their own trades.
- [x] T-15: Report final line counts of all 3 files (`ui.tsx`, `report-generator.ts`, `db.ts`).

## Post-Implementation

- [x] Run `/review trend-pullback-3day-final-checklist-items` to verify implementation matches spec
- [x] Confirm exactly three files changed (`ui.tsx`, `report-generator.ts`, `db.ts`)
- [x] Confirm the documented PDF-rendering gap (data computed but not printed) is still accurate post-implementation, and decide whether to open a follow-up CHANGE for it

## Estimated Complexity

Low — three small, independent, well-isolated additions across three files, each mirroring patterns already established this session. The one non-trivial item is the `SignalTypeBreakdown` interface widening discovered during spec research (not in the original task prompt) — required for `tsc` to pass, and already incorporated into this task list.
