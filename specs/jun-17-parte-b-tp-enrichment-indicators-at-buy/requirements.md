# Requirements — Jun 17 Parte B: Inline enrichment tp_population_bucket + tp_zscore en indicators_at_buy

## Context

`populationBucket` was removed in Parte A as temporary calibration logging.
This spec reintroduces it as **permanent observability data** persisted in the
`indicators_at_buy` JSONB column of `trade_evaluations` — not as a console log.

The two new fields are queryable post-trade for TREND_PULLBACK regime analysis:
- `tp_population_bucket`: categorical label for where z-score falls within the pullback population
- `tp_zscore`: the exact z-score at entry, stored alongside the bucket label

---

## Functional Requirements

FR-01: When a TREND_PULLBACK BUY executes via Path 1 (single-slot immediate execution),
       the system shall persist `tp_population_bucket` in `indicators_at_buy`.

FR-02: When a TREND_PULLBACK BUY executes via Path 2 (ranking winner execution),
       the system shall persist `tp_population_bucket` in `indicators_at_buy`.

FR-03: When a TREND_PULLBACK BUY executes and z-score ≥ 1.0, the system shall
       set `tp_population_bucket` to `'CONTINUATION'`.

FR-04: When a TREND_PULLBACK BUY executes and z-score ≥ 0 and z-score < 1.0,
       the system shall set `tp_population_bucket` to `'CHOP'`.

FR-05: When a TREND_PULLBACK BUY executes and z-score < 0, the system shall
       set `tp_population_bucket` to `'PULLBACK'`.

FR-06: When a TREND_PULLBACK BUY executes, the system shall persist `tp_zscore`
       in `indicators_at_buy` as the numeric z-score value at entry.

FR-07: When a TREND_PULLBACK BUY executes via Path 1 and z-score is not a number,
       the system shall set both `tp_population_bucket` and `tp_zscore` to `null`.

FR-08: When a TREND_PULLBACK BUY executes via Path 2 and neither `best.zScore`
       nor `best.indicators.kalman?.zScore` is a number, the system shall set
       both `tp_population_bucket` and `tp_zscore` to `null`.

FR-09: When a BUY of any signal type other than TREND_PULLBACK executes
       (MEAN_REVERSION, TREND_ZLE05, EMA_RECLAIM), the system shall NOT add
       `tp_population_bucket` or `tp_zscore` to `indicators_at_buy`.

FR-10: Where Path 2 TREND_PULLBACK BUY executes, the system shall prefer
       `best.zScore` (direct buyQueue field) over `best.indicators.kalman?.zScore`
       as the source for `tp_zscore`.

FR-11: The system shall not alter the `indicators_at_buy` JSONB for non-TREND_PULLBACK
       trades — all existing fields shall pass through unchanged.

---

## Non-Functional Requirements

NFR-01: After implementation, `npx tsc --noEmit` shall produce zero errors
        (no TS2345 or any other type errors from the cast pattern).

NFR-02: After implementation, `npm run build` shall complete successfully.

NFR-03: The change shall touch exactly one file: `src/lib/claude-agent.ts`.

NFR-04: The bucket thresholds (`>= 1.0` CONTINUATION, `>= 0` CHOP, `< 0` PULLBACK)
        shall be defined in a single helper function used by both paths — not duplicated.

---

## Constraints

C-01: This feature must not modify the Protected Zone without explicit confirmation from Amaury.
      `src/lib/claude-agent.ts` IS in the Protected Zone — Amaury confirmation required before implementation.

C-02: `TechnicalIndicators` type in `src/lib/types.ts` shall not be modified.

C-03: `saveOpenPositionContext()` signature and implementation in `src/lib/learning.ts` shall not be modified.

C-04: `src/lib/db.ts` and `insertTradeEvaluation()` shall not be modified.

C-05: `src/lib/indicators.ts` and `calculateAllIndicators()` shall not be modified.

C-06: No trading logic, gate condition, signal detection, or exit rule shall be altered.

---

## Out of Scope

- Dashboard display of `tp_population_bucket` or `tp_zscore` fields.
- Adding `tp_population_bucket` or `tp_zscore` to the `TechnicalIndicators` TypeScript type.
- Any database schema migration (JSONB is schemaless — no migration needed).
- Backfilling historical `trade_evaluations` rows.
- Adding TREND_ZLE05- or EMA_RECLAIM-specific enrichment fields.
- Any changes to MR, ZLE05, EMA_RECLAIM, or exit logic.
