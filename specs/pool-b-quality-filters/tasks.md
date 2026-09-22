# Tasks — Apply Pool A's Quality Filters to Pool B (sectorSnapshots)

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Protected Zone changes confirmed — N/A, `stock-selector.ts` is not Protected Zone
- [x] Database migrations drafted — N/A, none needed

## Implementation Checklist

### Phase 1 — stock-selector.ts

- [x] T-01: Re-verify current exact line numbers for Pool A's filter block and Pool B's construction block before editing (they may have shifted since this spec was written) — do not assume the line numbers cited in `design.md` are still exact.
- [x] T-02: Add a new module-level function `applyPoolQualityFilters(pool: ScreenerStock[]): ScreenerStock[]` (placed near the file's other constants/helpers, above `selectStocksForAnalysis()`) containing exactly the blacklist check (`!INSTRUMENT_BLACKLIST.has(c.symbol)`) and the overbought-spike check with gap-volume exception (`passesChangeFilter || passesGapVolumeException`, including the `[GAP_VOL_EXCEPTION]` log line) currently inline in Pool A — logic moved, not rewritten or altered in behavior.
- [x] T-03: In Pool A, replace the two separate filter calls (blacklist + overbought) with a single call to `applyPoolQualityFilters()`. Move the existing `heldSymbols` filter (`candidates.filter(c => !heldSymbols.has(c.symbol))`) to run immediately after this call. Do not change what the `heldSymbols` filter excludes — only its position relative to the other two checks.
- [x] T-04: In Pool B, immediately after `const sectorSnapshots = await getStockSnapshots(sectorOnlySymbols)`, add `sectorSnapshots = applyPoolQualityFilters(sectorSnapshots)` (or equivalent reassignment) before it is merged into `allCandidates`. Do not touch the existing `heldSymbols` filter on `sectorOnlySymbols` (from the prior change) — it stays pre-fetch, unchanged.
- [x] T-05: Confirm `MAX_POOL_A_CANDIDATES`, the sort-by-past-profitability logic, and the truncation to Pool A's top-15 are NOT applied anywhere in the Pool B path.
- [x] T-06: Confirm every other line in the file — the mandatory sector-coverage instruction, both "6-8 symbols" instructions, the prior change's `heldSymbols` filter on the return statement, `recordSelectionOutcome()` — is byte-for-byte unchanged.

## Post-Implementation

- [x] T-07: Run `npx tsc --noEmit` — must pass with zero new errors.
- [x] T-08: Produce a diff-only view (`git diff -- src/lib/stock-selector.ts`) confirming the change is confined to this file.
- [x] T-09: Show the extracted `applyPoolQualityFilters()` helper in the completion report and confirm both the Pool A call site and the Pool B call site invoke it (not two separate implementations).
- [x] T-10: Run `npx vitest run src/lib/__tests__/stock-selector.test.ts` — confirm no regressions (existing tests pass; update only if a test was asserting on the old two-separate-filter-calls structure rather than on resulting behavior).
- [x] T-11: State explicitly, in the completion report, whether the "Known Data Constraint" (Pool B's gap-volume exception is structurally inert because `getStockSnapshots()` hardcodes `relativeVolume: 1`) and the "Known Behavior Change" (quality-filtered-out sector) analyses in `design.md` still hold against the actual shipped diff — not just the plan.
- [ ] Run `/review pool-b-quality-filters` to verify implementation matches spec.
- [x] Confirm Protected Zone files unchanged — expected, `stock-selector.ts` is not Protected Zone.

## Estimated Complexity

**Low** — one extracted helper function (pure logic relocation, no behavior change to the extracted logic itself) called from two sites, one of which is a new call. The main subtlety is the Pool A filter reordering (provably safe — filter predicates only remove, order doesn't affect the resulting set) and the data-shape caveat around `getStockSnapshots()`'s hardcoded `relativeVolume`, both analyzed in `design.md` rather than engineered around, per the CHANGE prompt's own scope boundary (`src/lib/alpaca.ts` is out of scope).
