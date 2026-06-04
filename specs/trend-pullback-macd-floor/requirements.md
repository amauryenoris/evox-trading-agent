# Requirements — TREND_PULLBACK MACD Floor Gate

## Context

GOOGL executed a BUY at $367.47 with MACD histogram = -5.84. Historical data
(12 TREND_PULLBACK trades, baseline frozen Jun 4 2026) shows recoverable
pullbacks cluster at MACD -1.42 to -1.69 (COP +1.5%, NVDA +1.6%).
MACD < -2.0 indicates deteriorating momentum (knife-catching), not a healthy
retracement. This is an additive experimental gate — no existing conditions
are removed.

Pre-fix baseline (frozen Jun 4 2026):
- Expectancy: +3.63% | Profit factor: 3.71 | Win rate: 50.0%
- Avg win: +9.95% | Avg loss: -3.22% | n=12

---

## Functional Requirements

FR-01: The system shall reject a TREND_PULLBACK entry when `macdHistogram` is
       null or when `macdHistogram <= -2.0`.

FR-02: The system shall approve a TREND_PULLBACK entry on `macdHistogram`
       grounds when `macdHistogram` is not null and `macdHistogram > -2.0`.

FR-03: The system shall apply the MACD floor gate exclusively to TREND_PULLBACK
       setup detection and shall not alter TREND_ZLE05, MEAN_REVERSION, or
       EMA_RECLAIM setup logic.

FR-04: The system shall emit a `[TREND_PULLBACK_BLOCKED_MACD]` log line for
       each symbol where TREND_PULLBACK is blocked solely by the MACD floor
       (i.e., all other TREND_PULLBACK conditions pass).

FR-05: The system shall emit a `[TREND_PULLBACK_ENTRY]` log line for each
       symbol where TREND_PULLBACK setup is fully detected.

FR-06: The system shall emit a `[TREND_PULLBACK_HIGH_VOL]` log line for each
       TREND_PULLBACK entry detected while `marketRegime === 'HIGH_VOLATILITY'`.

FR-07: The system shall emit exactly one `[TREND_PULLBACK_STATS]` log line per
       agent cycle, after all symbols have been evaluated, reporting the total
       count of MACD-blocked TREND_PULLBACK candidates.

FR-08: Where the TREND_PULLBACK MACD floor gate is active, the system shall
       classify the z-score of every logged symbol into one of three buckets:
       `deep_pullback` (z ≤ -1.0), `standard_pullback` (-1.0 < z ≤ -0.5),
       or `shallow_pullback` (z > -0.5), and shall emit `invalid_z` when
       `zScore` is not a finite number.

FR-09: The system shall not modify entry logic, exit logic, or position sizing
       for any currently open positions (GOOGL, AVGO, NVDA at time of writing).

---

## Non-Functional Requirements

NFR-01: The MACD floor threshold (`-2.0`) shall be declared as a named
        constant `trendPullbackMacdFloor` in source — not an inline literal.

NFR-02: The temp logging blocks introduced by this feature shall be removed on
        or before 2026-06-17.

NFR-03: The change shall introduce zero TypeScript compilation errors.

---

## Constraints

C-01: This feature modifies `src/lib/claude-agent.ts`, which is in the
      Protected Zone. Amaury must confirm before implementation.

C-02: The variables `trendPullbackMomentumOk`, `trendPullbackMacdFloor`, and
      `wouldPassWithoutMacdFloor` are isolated to the TREND_PULLBACK block and
      must not be referenced by TREND_ZLE05 or any other setup.

C-03: `macdHistogram` is already declared in scope — it must not be
      redeclared. `confidence` is not available in this scope — it must not
      be referenced.

C-04: `momentumOk`, `trendQualityOk`, and `adxOk` must not be modified.

---

## Out of Scope

- HIGH_VOLATILITY regime filter (explicitly rejected — INTC +24.6%, POET +15.0%
  were both HIGH_VOL entries that performed well)
- Modifying exit rules for any signal type
- Modifying open-position management (GOOGL, AVGO, NVDA)
- Position sizing changes
- Re-entry cooldown changes
- Dashboard display changes
- Any database schema changes
- Permanent promotion of `trendPullbackMacdFloor` to `config.ts`
