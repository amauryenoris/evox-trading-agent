# Requirements — TREND_ZLE05 Adaptive ADX Gate (Bucket A)

## Context

Rejection analytics over 21 days and 45 rejection-days confirm a positive edge in
the ADX 15–26 range when MACD histogram > 0. The prior fix (commits 4de7ec3,
a7e8ec4) raised the ZLE05-specific ADX floor to 25, which is now confirmed too
tight. This spec replaces that flat threshold with a two-tier adaptive gate:
ADX >= 18 passes freely; ADX 15–17 requires MACD histogram > 0.25 as a momentum
confirmation. ADX < 15 is always blocked. The z-score window (0 < z <= 1.25) is
correct and must not be changed. Bucket B (z > 1.25) is deferred to Phase 2.

Target pass/block profile (derived from 21-day analytics):

| Symbol / Date  | ADX  | MACD  | Expected |
|----------------|------|-------|----------|
| FCX May 28     | 15.7 | 0.29  | PASS     |
| FCX May 29     | 16.4 | 0.45  | PASS     |
| FCX May 26     | 15.8 | 0.13  | BLOCK    |
| MP  May 28     | 21.9 | 0.22  | PASS     |
| OXY            | 12.0 | 0.01  | BLOCK    |
| GOLD           | 11.0 | 0.09  | BLOCK    |

---

## Functional Requirements

FR-01: The system shall accept `adxOkZLE05` as true when ADX is non-null and
       greater than or equal to 18, regardless of the MACD histogram value.

FR-02: The system shall accept `adxOkZLE05` as true when ADX is non-null, greater
       than or equal to 15, less than 18, and the MACD histogram is greater than
       0.25.

FR-03: The system shall reject `adxOkZLE05` (set to false) when ADX is null.

FR-04: The system shall reject `adxOkZLE05` (set to false) when ADX is less than 15.

FR-05: The system shall reject `adxOkZLE05` (set to false) when ADX is in the range
       [15, 18) and the MACD histogram is null or less than or equal to 0.25.

FR-06: Where a TREND_ZLE05 entry is accepted, the system shall log a
       `[TREND_ZLE05_ENTRY]` line that includes: an `adxBucket` field set to
       `normal` when ADX >= 18 and `low_adx_boost` when ADX is in [15, 18), the
       symbol, z-score, ADX value, and MACD histogram.

FR-07: Where a TREND_ZLE05 signal is rejected because z > 1.25, the system shall
       log a `[TREND_ZLE05_REJECTED_Z]` line that includes: symbol, z-score, ADX
       value, MACD histogram, the boolean result of `adxOkZLE05`, and market regime.

FR-08: The system shall retain the existing `trendZLE05Signals`, `legacySignals`,
       `expandedSignals`, and `trendZLE05Rejected` counters and the
       `[TREND_ZLE05_STATS]` summary log unchanged.

---

## Non-Functional Requirements

NFR-01: The change shall produce zero TypeScript compilation errors
        (`npx tsc --noEmit`).

NFR-02: The change shall not alter position sizing, exit rules, re-entry cooldown,
        or risk parameters for any signal type.

NFR-03: The `adxBucket` attribution in the entry log is temporary diagnostic
        logging. It shall be evaluated for removal after the rollback criteria
        period has elapsed (>= 10 completed TREND_ZLE05 trades OR 14 trading days,
        whichever is later).

---

## Constraints

C-01: This feature modifies `src/lib/claude-agent.ts`, which is in the Protected
      Zone. Explicit confirmation from Amaury is required before implementation.

C-02: `adxOk` (used by `trendQualityOk` for TREND_PULLBACK) shall not be changed.

C-03: `trendQualityOk` (TREND_PULLBACK) shall not be changed.

C-04: The `macdHistogram > 0` check inside `trendZLE05Setup` shall not be changed —
      it is the global MACD gate and is independent of the ADX boost logic.

C-05: MEAN_REVERSION, TREND_PULLBACK, and EMA_RECLAIM detection blocks shall not
      be changed.

C-06: `enforceExitRules()`, `detectMarketRegime()`, `openPositionSymbols` gate,
      and position-sizing logic shall not be changed.

C-07: The z-score upper bound `zScore <= 1.25` in `trendZLE05Setup` shall not be
      changed.

---

## Rollback Criteria

Rollback to `adxOkZLE05 = adxValue !== null && adxValue >= 25` if, after the
minimum sample is met (>= 10 completed TREND_ZLE05 trades OR 14 trading days,
whichever is later), any of the following are true:

- Overall TREND_ZLE05 expectancy <= 0
- Overall TREND_ZLE05 profit factor < 1.1
- `low_adx_boost` bucket expectancy < 0 (evaluated independently)

Win rate alone is not a rollback trigger.

---

## Out of Scope

- Bucket B expansion (z > 1.25) — deferred to Phase 2
- Changing TREND_PULLBACK's ADX threshold
- Removing temporary logging (separate follow-up commit)
- Any change to `detectMarketRegime()` thresholds
- Position sizing or trailing stop adjustments for TREND_ZLE05
