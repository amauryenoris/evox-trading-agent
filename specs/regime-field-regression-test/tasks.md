# Tasks — Regime-Field Regression Test (market_regime vs spx_regime)

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Protected Zone changes confirmed: N/A — test file only, not Protected Zone
- [x] Database migrations drafted: N/A

## Implementation Checklist

### Phase 1 — Add the regression test
- [x] T-01: Re-read `gate-relevance-context.test.ts`'s `makeFingerprint()`
      helper and the two existing "Regime" assertions (~lines 109, 192)
      live to confirm no drift since this spec's verification pass.
      Confirmed unchanged.
- [x] T-02: Add one new `it()` inside the existing
      `describe('buildLearningContext() — gate-aware relevance comparison', ...)`
      block: build a `currentFingerprint` and one historical
      `stateFingerprint` via `makeFingerprint()` with `market_regime` equal
      on both (e.g. both `'RANGING'`) and `spx_regime` different between
      them (e.g. current `'BULL'`, historical `'BEAR'`); assert the
      rendered context contains a "Regime matches (both RANGING)" line.
- [x] T-03: Decided NOT to add the mirror case, per design.md's reasoning
      (already documented as the chosen alternative pre-implementation):
      the existing NOK/NFLX test (differs, MEAN_REVERSION/TREND_ZLE05) and
      the EMA_RECLAIM test (differs, ADX/MACD) already exercise "Regime
      differs" paths with `market_regime` varied; a dedicated mirror case
      with `spx_regime` held misleadingly equal would duplicate scaffolding
      for limited extra guarantee (per spec's own C-02 judgment call).
- [x] T-04: Confirmed via `git diff` (see T-07/verification below) — the
      change is purely additive, one new `it()` block; zero existing test
      case altered.

### Phase 2 — Verification
- [x] T-05: Run the new test(s) — confirm they pass against current
      (already-correct) production code.
      Result: 8/8 passed (7 pre-existing + 1 new).
- [x] T-06: One-time manual regression check (NOT a permanent code change):
      temporarily edit `getFingerprintDimensionValue()`'s `'regime'` branch
      in `learning.ts` to return `fp.spx_regime` instead of
      `fp.market_regime`, re-run the new test, confirm it FAILS, then
      revert the temporary edit and confirm `git diff` on `learning.ts`
      shows zero changes afterward.
      Result: with the swap in place, 3/8 tests failed — the new test
      failed exactly as predicted, and as a bonus the pre-existing
      EMA_RECLAIM test (line ~192) also failed, since it asserts the exact
      regime *value* ("both TRENDING"), which changed to "both BULL" once
      spx_regime was read instead. Reverted; `git diff -- learning.ts` is
      empty, confirming zero net change.
- [x] T-07: Run the full `gate-relevance-context.test.ts` file — confirm
      all pre-existing tests still pass unmodified (NFR-03).
      Confirmed via T-05's clean run (8/8, no pre-existing test altered).
- [x] T-08: Run `npx tsc --noEmit` — confirm zero errors.
- [x] T-09: Run `npm run build` — confirm it passes.
- [x] T-10: Run the full project test suite — confirm 100% pass, zero new
      failures, zero skipped tests.

## Post-Implementation

- [x] Confirm `git status` shows only `gate-relevance-context.test.ts`
      changed (no production file touched, confirming FR-04/FR-05)
      Confirmed: `M src/lib/__tests__/gate-relevance-context.test.ts` only.
- [x] Run `/review regime-field-regression-test` to verify implementation
      matches spec
      Result: APPROVED — see specs/regime-field-regression-test/review.md

## Estimated Complexity

**Low** — one additive test case in an existing file, using already-established
helpers and patterns; zero production code risk; the only non-trivial step
is the temporary-revert meta-verification in T-06.
