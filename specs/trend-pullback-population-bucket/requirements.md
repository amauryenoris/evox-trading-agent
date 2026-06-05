# Requirements — TREND_PULLBACK Population Bucket Attribution

## Functional Requirements

FR-01: The system shall classify each TREND_PULLBACK candidate into one of three population buckets — CONTINUATION, CHOP, or PULLBACK — based on the z-score at the time of evaluation.

FR-02: The system shall assign the CONTINUATION bucket when z-score is greater than or equal to 1.0.

FR-03: The system shall assign the CHOP bucket when z-score is greater than or equal to 0 and less than 1.0.

FR-04: The system shall assign the PULLBACK bucket when z-score is less than 0.

FR-05: The system shall include the population bucket value in the `[TREND_PULLBACK_ENTRY]` log line as the field `population=` immediately after the symbol field.

FR-06: The system shall declare `populationBucket` immediately after the existing `zBucket` declaration, within the same per-symbol loop scope.

## Non-Functional Requirements

NFR-01: The `populationBucket` variable shall introduce zero TypeScript errors (strict mode compatible — inferred as a string literal union or plain string).

NFR-02: The `[TREND_PULLBACK_ENTRY]` log line format shall remain parseable by existing log-analysis scripts (new field added as the second field, before existing fields).

## Constraints

C-01: This feature must not modify `zBucket` — its declaration, thresholds (deep_pullback / standard_pullback / shallow_pullback / invalid_z), or its appearance in `[TREND_PULLBACK_BLOCKED_MACD]`.

C-02: This feature must not modify `trendSetup`, `trendPullbackMomentumOk`, `trendPullbackMacdFloor`, or any other entry-gate condition.

C-03: This feature must not modify `enforceExitRules()`, position sizing, or any other signal (ZLE05, MEAN_REVERSION, EMA_RECLAIM).

C-04: The `[TREND_PULLBACK_BLOCKED_MACD]` log must remain unchanged.

## Out of Scope

- Adding `population=` to `[TREND_PULLBACK_BLOCKED_MACD]` or any other log tag
- Using `populationBucket` in gate logic or position sizing
- Persisting `populationBucket` to the database
- Dashboard display of population bucket data
- Any architectural changes based on population analysis (deferred to Phase 2 analysis)
