# Tasks — Gate-Aware Relevance Context in RECENT TRADE LESSONS

## Pre-Implementation

- [ x] Amaury has reviewed and approved this spec
- [ x] Protected Zone changes confirmed: `learning.ts` and `claude-agent.ts`
      touches explicitly approved (⚠️ per design.md)
- [x ] `db.ts` scope-expansion (single-line mapper fix) explicitly approved
      — already confirmed via this spec's blocking-discovery decision
- [ x] Database migrations drafted: N/A — no schema change

## Implementation Checklist

### Phase 1 — Fix the data-layer gap (db.ts)
- [x] T-01: Re-read `getTradeEvaluations()`'s current row-mapper
      (`db.ts`, ~lines 266-320) live to confirm no drift since this spec's
      verification pass.
      Confirmed unchanged.
- [x] T-02: Add `stateFingerprint: row.state_fingerprint ?? null,` to the
      mapped object, placed near the existing `signal_type` mapping. No
      other line in the function may change.
- [x] T-03: Grep the file to confirm `insertTradeEvaluation()` (the write
      path) is untouched and still writes `state_fingerprint` correctly.
      Confirmed: `state_fingerprint: evaluation.stateFingerprint ?? null`
      at db.ts:249, unchanged.

### Phase 2 — buildLearningContext() signature + comparison logic (learning.ts)
- [x] T-04: Re-read `learning.ts:290-329` live to confirm no drift.
      Confirmed unchanged.
- [x] T-05: Change the signature to
      `buildLearningContext(indicators: TechnicalIndicators, currentFingerprint: StateFingerprint | null = null): Promise<string>`.
- [x] T-06: Import `DIMENSION_IMPORTANCE` (read-only) from `./gate-importance`
      and `StateFingerprint` (type-only) from `./types`, matching
      `learning.ts`'s actual relative location.
      DEVIATION (disclosed): no standalone `StateFingerprint` type is
      exported from `types.ts` — it only exists as an inline anonymous
      type on `TradeEvaluation.stateFingerprint`. Adding a new export to
      `types.ts` would touch a file outside this spec's approved scope.
      Instead, derived `type StateFingerprint = NonNullable<TradeEvaluation['stateFingerprint']>`
      locally in `learning.ts` — this exact pattern already exists in
      `pattern-library-key-matching-fix.test.ts:21`, so it's an established
      codebase convention, not a new one. Zero scope expansion.
- [x] T-07: In the RECENT TRADE LESSONS loop, implement the per-entry
      gate: render a comparison line only when `currentFingerprint` is
      non-null, `e.stateFingerprint` is non-null, and both `signal_type`
      values are keys in `DIMENSION_IMPORTANCE`; otherwise fall back to the
      existing unlabeled line for that entry (FR-09).
- [x] T-08: Implement per-dimension comparison for `adx_bucket`,
      `macd_bucket`, `z_bucket`, `market_regime` (not `spx_regime` — FR-06):
      skip a dimension individually when either side's value for it is
      null (FR-05); state "matches" when equal (FR-08); show both values
      with `DIMENSION_IMPORTANCE` annotations per own `signal_type` when
      they differ (FR-07).
- [x] T-09: After the full RECENT TRADE LESSONS list, append the exact
      interpretive sentence from FR-10 once, only if at least one
      comparison line was rendered in that call.
- [x] T-10: Confirm which 5 trades are selected, their order, and
      `lessonsLearned` text are untouched (FR-11).
      Confirmed: `evaluations.slice(0, 5)` and
      `e.lessonsLearned.slice(0, 2)` byte-identical to before; extracted
      into `buildRecentTradeLessonsLines()` (pure extraction, no behavior
      change) to keep `buildLearningContext()` under the project's 50-line
      function guideline after the new logic was added.

### Phase 3 — Call site wiring (claude-agent.ts)
- [x] T-11: Re-read `claude-agent.ts` around the call site (~line 1649)
      live to confirm no drift. Confirmed unchanged.
- [x] T-12: Assemble `currentFingerprint` from in-scope values
      (`signalType`, `spxSnapshot.spx_regime`, `indicators.marketRegime`,
      `getAdxBucket(adxValue)`, `getZBucket(zScore, signalType)`,
      `getMacdBucket(macdHistogram)`) immediately before the existing
      `buildLearningContext()` call.
- [x] T-13: Pass `currentFingerprint` as the second argument. No other
      line at or around the call site changes.

### Phase 4 — Testing
- [x] T-14: Add tests covering: comparison line renders when both
      fingerprints present and both `signal_type`s are valid keys (include
      the NOK/NFLX-shaped case: MEAN_REVERSION/POSITIVE MACD vs.
      TREND_ZLE05/DEEP_NEGATIVE MACD, asserting correct differ + correct
      per-side gate-importance annotation).
      Added in `gate-relevance-context.test.ts`.
- [x] T-15: Add a test asserting `currentFingerprint = null` (the default)
      produces output identical to calling with one argument only —
      regression safety for the one pre-existing caller.
- [x] T-16: Add a test where one historical entry's `stateFingerprint` is
      null — confirm that entry falls back to the unlabeled format while
      the other 4 entries are unaffected. (Test uses 2 entries — same
      per-entry mechanism, minimal reproduction.)
- [x] T-17: Add a test for the per-dimension null case (e.g., an
      EMA_RECLAIM entry with `z_bucket: null` on one side) — confirm the
      other 3 dimensions still compare correctly and only `z` is omitted.
      Bonus: also added a test for the legacy `signal_type: 'TREND'` case
      (not a `DIMENSION_IMPORTANCE` key) falling back correctly.
- [x] T-18: Add a test confirming the interpretive sentence appears exactly
      once when ≥1 comparison line rendered, and is absent entirely when
      zero comparison lines rendered across all 5 entries.
- [x] T-19: Add/extend a `db.ts` test confirming `getTradeEvaluations()`
      now maps `state_fingerprint` onto `stateFingerprint` correctly (and
      to `null` when the column is null). Added
      `db.trade-evaluations-fingerprint.test.ts` (3 cases: populated,
      explicit null, missing/legacy column).
- [x] T-20: Confirm `pattern-library-min-sample-gate.test.ts` still passes
      unmodified (NFR-03). Ran in isolation: 10/10 passed.

### Phase 5 — Verification
- [x] T-21: Grep `learning.ts` to confirm `DIMENSION_IMPORTANCE` is never
      written or mutated — import/read-only usage only (NFR-05).
      Confirmed: only 2 usages, both index-reads (`DIMENSION_IMPORTANCE[...]`).
- [x] T-22: Run `npx tsc --noEmit` — confirm zero errors. Clean.
- [x] T-23: Run `npm run build` — confirm it passes. "Compiled successfully."
- [x] T-24: Run the full test suite — confirm 100% pass, zero new
      failures, zero skipped tests. Result: 29 files / 296 tests, all
      passed (286 pre-existing + 10 new), zero skipped.

## Post-Implementation

- [x] Confirm `git status` shows only `db.ts`, `learning.ts`,
      `claude-agent.ts`, and the new test file(s) changed
- [x] Run `/review gate-relevance-context` to verify implementation
      matches spec
      Result: APPROVED WITH WARNINGS — see specs/gate-relevance-context/review.md
      (1 MEDIUM: FR-06 test-coverage gap, not blocking)
- [x] Confirm Protected Zone files (`learning.ts`, `claude-agent.ts`) diffs
      are scoped exactly as described in design.md — no unrelated changes

## Estimated Complexity

**Medium** — three files across two layers, several distinct edge cases
(whole-entry fallback, per-dimension null, once-only interpretive note,
default-null backward compatibility), and new test coverage required;
no new database schema, no gate-logic changes, and the riskiest file
(`claude-agent.ts`) only gets a 2-line additive touch at one call site.
