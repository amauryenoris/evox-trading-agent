# Requirements — TREND_ZLE05 Widen Z-Score Window

## Context

21 days of rejection analytics from `agent_log` show consistent alpha left on the
table in the 0.5 < z <= 1.25 range when ADX >= 25. Losers clustered at ADX 20–24;
winners at ADX 26+. ADX null has not occurred in production in the last 7 days —
the pipeline always delivers ADX. The fix widens the z-score upper bound and raises
the ADX floor. Temp logging is added to validate the expanded window in production
for 2 weeks before a follow-up cleanup commit removes it.

---

## Functional Requirements

FR-01: The system shall accept a TREND_ZLE05 setup when the Kalman z-score is
       greater than 0 and less than or equal to 1.25 (replacing the previous
       upper bound of 0.5), provided all other TREND_ZLE05 conditions are met.

FR-02: The system shall require ADX to be non-null and greater than or equal to 25
       for TREND_ZLE05 to be accepted (replacing the previous gate of >= 20 with
       null pass-through).

FR-03: The system shall log a `[TREND_ZLE05]` blocked message per symbol when
       ADX is null and the symbol is in the trade zone (z > 0 and z <= 1.25) with
       a positive MACD histogram.

FR-04: The system shall log a `[TREND_ZLE05_ENTRY]` line per accepted signal,
       including the z-score bucket (`legacy` for z <= 0.5, `expanded` for
       z > 0.5), the symbol, z-score, ADX, and MACD histogram.

FR-05: The system shall log a `[TREND_ZLE05_REJECTED_Z]` line per symbol where
       all TREND_ZLE05 conditions pass except the z-score is in the next frontier
       bucket (1.25 < z <= 2.5).

FR-06: The system shall log a `[TREND_ZLE05_STATS]` line once per cycle, after
       all symbols have been processed, summarising total signals, legacy-bucket
       signals, expanded-bucket signals, and z-rejected count for that cycle.

FR-07: The system shall not accept a TREND_ZLE05 entry for z > 1.25 under any
       condition (the next frontier bucket is observation-only).

---

## Non-Functional Requirements

NFR-01: The temp logging (FR-03 – FR-06) shall be removed in a follow-up commit
        approximately 2 weeks after this change is deployed to production.

NFR-02: The change shall produce zero TypeScript compilation errors (`npx tsc
        --noEmit`).

NFR-03: The change shall not alter position sizing, exit rules, or risk parameters
        for any signal type.

---

## Constraints

C-01: This feature modifies `src/lib/claude-agent.ts`, which is in the Protected
      Zone. Explicit confirmation from Amaury is required before implementation.

C-02: `detectMarketRegime()` and its ADX/ATR thresholds shall not be changed.

C-03: MEAN_REVERSION, TREND_PULLBACK, and EMA_RECLAIM detection blocks shall not
      be changed.

C-04: `momentumOk`, `ema50SlopeOk`, and `trendQualityOk` shall not be changed
      beyond the single `adxOk` line.

C-05: `enforceExitRules()`, re-entry cooldown logic, and `openPositionSymbols`
      gate shall not be changed.

---

## Out of Scope

- Changing `detectMarketRegime()` thresholds or adding a regime filter to
  TREND_ZLE05 (regime is not a condition in this fix)
- Adjusting position sizing or trailing stop thresholds for TREND_ZLE05
- Permanently expanding z-score beyond 1.25 (that requires a separate spec)
- Removing temp logging (that is a separate follow-up commit)
- Any change to TREND_PULLBACK's ADX threshold
