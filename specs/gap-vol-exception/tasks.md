# Tasks — Gap+Volume Exception for Pool A Filter

## Pre-Implementation

- [ x] Amaury has reviewed and approved this spec
- [x ] Amaury has decided the `getStockSnapshots()` open question (design.md — required vs. optional `relativeVolume`, or a default value)
- [x ] Protected Zone changes confirmed — N/A, none required
- [ x] Database migrations drafted — N/A, none required

## Implementation Checklist

### Phase 1 — Types
- [x] T-01: Add `relativeVolume: number` to `ScreenerStock` in `src/lib/types.ts` (lines 254-259)

### Phase 2 — Data Layer (alpaca.ts)
- [x] T-02: In `getMarketMovers()` (`src/lib/alpaca.ts:194-218`), restructure the `.map()`/`.filter()` chain to an intermediate `rawCandidates` array, compute `avgVolume` across it, and return each candidate with `relativeVolume = avgVolume > 0 ? volume / avgVolume : 0`
- [x] T-03: Resolve the `getStockSnapshots()` type conflict per Amaury's decision from Pre-Implementation (add default `relativeVolume`, or make the field optional)

### Phase 3 — Pool A Filter (stock-selector.ts)
- [x] T-04: Add `const HIGH_RELATIVE_VOLUME_THRESHOLD = 1.5` immediately after `MAX_DAILY_CHANGE_PCT` (line 19)
- [x] T-05: Modify the Step 3 filter (line 67) to OR in the `relativeVolume >= HIGH_RELATIVE_VOLUME_THRESHOLD` exception, logging `[GAP_VOL_EXCEPTION]` only when a candidate is saved by it
- [x] T-06: Tag Pool A prompt lines (lines 113-117) with ` [GAP+VOL]` for candidates whose `|changePercent| >= MAX_DAILY_CHANGE_PCT`

### Phase 4 — Testing
- [x] T-07: Add tests to `src/lib/__tests__/stock-selector.test.ts` (or a new file) covering: normal mover (< 15% change) included regardless of `relativeVolume`; large-gap + low-volume excluded with no log; large-gap + high-volume included, tagged, and logged
- [x] T-08: Add a test covering `relativeVolume` computation correctness for a constructed 3-candidate batch with known volumes
- [x] T-09: Add a test covering the empty-candidate-batch edge case (no crash, `relativeVolume` defaults to 0, no log line)
- [x] T-10: Confirm the 2 existing `stock-selector.test.ts` tests (briefingNarrative section) still pass unmodified

## Post-Implementation

- [x] Run `/review gap-vol-exception` to verify implementation matches spec
- [x] Run `npx tsc --noEmit` and `npm run build` — both must pass
- [x] Confirm Protected Zone files unchanged
- [x] Confirm no existing test assertions were modified

## Estimated Complexity

Low — the change is additive (one new field, one new constant, one filter OR-branch, one prompt tag) and confined to two files plus their type definition. The one open design question (getStockSnapshots' type conflict) is small in scope but must be resolved before implementation to avoid a broken build.
