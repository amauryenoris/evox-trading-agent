# Tasks — TREND_ZLE05 Adaptive ADX Gate (Bucket A)

## Pre-Implementation

- [X] Amaury has reviewed and approved this spec
- [x] Protected Zone change confirmed (`src/lib/claude-agent.ts`)

## Implementation Checklist

### Phase 1 — Signal detection gate (`src/lib/claude-agent.ts`)

- [x] T-01: Add `lowAdxMacdBoost = 0.25` constant immediately before `adxOkZLE05`
- [x] T-02: Replace `adxOkZLE05` flat threshold (`>= 25`) with the two-tier adaptive
            gate (`>= 18 || (>= 15 && macdHistogram > 0.25)`) as specified in design
            Change 1
- [x] T-03: Verify `trendQualityOkZLE05 = ema50SlopeOk && adxOkZLE05` is unchanged
- [x] T-04: Verify `adxOk` (TREND_PULLBACK gate) and `trendQualityOk` are unchanged

### Phase 2 — Logging updates (`src/lib/claude-agent.ts`)

- [x] T-05: Inside the `if (trendZLE05Setup)` block, declare `adxBucket` and update
            the `[TREND_ZLE05_ENTRY]` log to use `bucket=${adxBucket}` (design
            Change 2). Retain existing `zBucket`, `legacySignals++`,
            `expandedSignals++` for the STATS log.
- [x] T-06: Update the `[TREND_ZLE05_REJECTED_Z]` log to add the `adxOkZle` field
            (design Change 3)

### Phase 3 — Verification

- [x] T-07: Run `npx tsc --noEmit` — zero errors required
- [x] T-08: Mentally trace FCX May 28 profile (ADX 15.7, MACD 0.29) → `adxOkZLE05`
            must be true
- [x] T-09: Mentally trace FCX May 26 profile (ADX 15.8, MACD 0.13) → `adxOkZLE05`
            must be false
- [x] T-10: Mentally trace MP May 28 profile (ADX 21.9, MACD 0.22) → `adxOkZLE05`
            must be true
- [x] T-11: Mentally trace OXY profile (ADX 12, MACD 0.01) → `adxOkZLE05` must be
            false
- [x] T-12: Confirm `adxOk` (TREND_PULLBACK) is still `adxValue === null || adxValue >= 20`

## Post-Implementation

- [x] Run `/review trend-zle05-adaptive-adx` to verify implementation matches spec
- [x] Confirm `adxOk` and `trendQualityOk` unchanged (TREND_PULLBACK unaffected)
- [x] Confirm `trendZLE05Signals` counter and `[TREND_ZLE05_STATS]` log unchanged
- [x] Confirm `zScore <= 1.25` in `trendZLE05Setup` unchanged
- [X] Deploy and monitor `[TREND_ZLE05_ENTRY]` bucket attribution for 14 trading days
      or >= 10 completed trades, whichever is later, before evaluating rollback

## Estimated Complexity

Low — three targeted edits to two consecutive variables and two log lines within a
single block of `claude-agent.ts`. No new functions, no schema changes, no new
dependencies.
