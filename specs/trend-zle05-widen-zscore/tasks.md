# Tasks — TREND_ZLE05 Widen Z-Score Window

## Pre-Implementation

- [X] Amaury has reviewed and approved this spec
- [X] Protected Zone change confirmed: `src/lib/claude-agent.ts` (REQUIRED)
- [ ] Database migrations drafted (N/A — no DB changes)

## Implementation Checklist

### Phase 1 — Core Gate Changes (src/lib/claude-agent.ts)

- [X] T-01: Change `adxOk` (line ~1034):
      `adxValue === null || adxValue >= 20`
      → `adxValue !== null && adxValue >= 25`

- [X] T-02: Change z-score upper bound in `trendZLE05Setup` (line ~1068):
      `zScore <= 0.5`
      → `zScore <= 1.25`

- [X] T-03: Change z-score upper bound in `isZLE05Candidate` (line ~1043):
      `zScore <= 0.5`
      → `zScore <= 1.25`
      (keeps quality-filter rejection gate consistent with widened range)

- [X] T-04: ⚠️ Change `trendSetupRejected` upper bound (line ~1096):
      `zScore > 0.5`
      → `zScore > 1.25`
      AND update the log message on line ~1112 from "> 0.5" to "> 1.25".
      CRITICAL: without this, `trendSetupRejected` fires a `continue` on every
      signal in 0.5–1.25 before `trendZLE05Setup` can accept it.

### Phase 2 — Temp Logging (src/lib/claude-agent.ts)

- [X] T-05: Declare four counters ONCE before the symbol loop (not inside it):
      ```typescript
      let trendZLE05Signals = 0
      let legacySignals = 0
      let expandedSignals = 0
      let trendZLE05Rejected = 0
      ```

- [X] T-06: Inside the symbol loop, after `macdHistogram` is set, add ADX null guard:
      ```typescript
      if (adxValue === null && zScore > 0 && zScore <= 1.25 && macdHistogram !== null && macdHistogram > 0) {
        console.log(`[TREND_ZLE05] ${symbol} blocked — ADX null`)
      }
      ```

- [X] T-07: Inside the symbol loop, after `trendZLE05Setup` is evaluated, compute
      `wouldPassWithoutZ` by copying the ACTUAL `trendZLE05Setup` expression and
      removing only the `zScore <= 1.25` upper bound:
      ```typescript
      const wouldPassWithoutZ =
        ema50Value > 0 &&
        ema200Value > 0 &&
        indicators.currentPrice > ema50Value &&
        ema50Value > ema200Value &&
        zScore > 0 &&
        momentumOk &&
        trendQualityOk &&
        macdHistogram !== null &&
        macdHistogram > 0
      ```

- [X] T-08: Inside the symbol loop, add entry log + counter increment after
      `trendZLE05Setup` is evaluated:
      ```typescript
      if (trendZLE05Setup) {
        trendZLE05Signals++
        const zBucket = zScore <= 0.5 ? 'legacy' : 'expanded'
        if (zBucket === 'legacy') legacySignals++
        else expandedSignals++
        console.log(`[TREND_ZLE05_ENTRY] bucket=${zBucket} symbol=${symbol} z=${zScore.toFixed(2)} adx=${adxValue} macd=${macdHistogram?.toFixed(3)}`)
      }
      ```

- [X] T-09: Inside the symbol loop, add frontier rejection log:
      ```typescript
      if (!trendZLE05Setup && zScore > 1.25 && zScore <= 2.5 && wouldPassWithoutZ) {
        trendZLE05Rejected++
        console.log(`[TREND_ZLE05_REJECTED_Z] symbol=${symbol} z=${zScore.toFixed(2)} adx=${adxValue} macd=${macdHistogram?.toFixed(3)} regime=${indicators.marketRegime}`)
      }
      ```

- [X] T-10: After the symbol loop (once per cycle), add stats log:
      ```typescript
      console.log(`[TREND_ZLE05_STATS] signals=${trendZLE05Signals} legacy=${legacySignals} expanded=${expandedSignals} rejectedZ=${trendZLE05Rejected}`)
      ```

### Phase 3 — Verification

- [X] T-11: Run `npx tsc --noEmit` — confirm zero TypeScript errors.
- [X] T-12: Run `npx vitest run` — confirm all existing tests pass.
- [X] T-13: Manually verify the VERIFY checklist from the original brief:
      - `zScore <= 1.25` in `trendZLE05Setup` ✓
      - `adxOk = adxValue !== null && adxValue >= 25` ✓
      - Counters declared before symbol loop ✓
      - `wouldPassWithoutZ` copied from actual setup code, upper z-bound removed only ✓
      - Entry log includes `bucket=legacy|expanded` ✓
      - Rejection log bounded to `z <= 2.5` ✓
      - `TREND_ZLE05_STATS` after all symbols, not inside loop ✓
      - `trendSetupRejected` updated to `> 1.25` ✓
      - All other conditions unchanged ✓

### Phase 4 — Testing

- [X] T-14: In `src/lib/__tests__/`, add unit tests covering:
      - z=0.8, ADX=27 → `trendZLE05Setup` = true (expanded bucket)
      - z=0.8, ADX=22 → `trendZLE05Setup` = false (ADX below new floor)
      - z=0.8, ADX=null → `trendZLE05Setup` = false (null no longer passes)
      - z=0.3, ADX=27 → `trendZLE05Setup` = true (legacy bucket, still works)
      - z=1.3, ADX=27 → `trendZLE05Setup` = false (above upper bound)
      - z=0.8, ADX=27, no MACD → `trendZLE05Setup` = false (MACD gate intact)
- [X] T-15: Verify 80% coverage on modified lines.

## Post-Implementation

- [ ] Run `/review trend-zle05-widen-zscore` to verify implementation matches spec
- [X] Confirm no other setup (MEAN_REVERSION, TREND_PULLBACK, EMA_RECLAIM) was changed
- [ ] Schedule follow-up task: remove temp logging (T-05–T-10) ~2026-06-17

## Estimated Complexity

**Low** — single file, ~10 lines changed + ~20 lines of temp logging added.
The critical co-change (`trendSetupRejected`) is a one-liner but must not be missed.
