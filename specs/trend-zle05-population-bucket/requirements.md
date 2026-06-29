# Requirements — TREND_ZLE05 Population Bucket Enrichment

## Context

TREND_PULLBACK already persists `tp_population_bucket` + `tp_zscore` in `indicators_at_buy`
(spec `jun-17-parte-b-tp-enrichment-indicators-at-buy`, commit `d5a5418`). That spec's
"Out of Scope" explicitly deferred the equivalent for TREND_ZLE05: *"Adding TREND_ZLE05- or
EMA_RECLAIM-specific enrichment fields."* This spec closes that gap for TREND_ZLE05 only.

TREND_ZLE05 has only 5 closed trades to date, z-score clustered in [0.19, 0.42] with one
outlier (z=1.16). The historical CONTINUATION edge (+10.9%, established in an earlier
TREND_PULLBACK diagnostic) lives in z>=1.0 — a zone TREND_ZLE05 rarely reaches. Without a
dedicated, queryable bucket/z-score field, this can only be analyzed today by manually
reconstructing z-score from `indicators_at_buy.kalman.zScore` (confirmed possible, per the
read-only diagnostic in this same session) or by reading the already-populated but
deeply-nested `indicators_at_buy.state_fingerprint.z_bucket` (confirmed already correctly
bucketing TREND_ZLE05 today via the existing `getZBucket()` function).

## Functional Requirements

FR-01: When a TREND_ZLE05 BUY executes via Path 1 (single-slot immediate execution), the system shall persist `zle05_population_bucket` in the entry's `indicators` object.

FR-02: When a TREND_ZLE05 BUY executes via Path 2 (ranking winner execution), the system shall persist `zle05_population_bucket` in the entry's `indicators` object.

FR-03: The system shall classify `zle05_population_bucket` using the existing `getZBucket(zScore, 'TREND_ZLE05')` function — not a new or duplicated threshold helper.

FR-04: When a TREND_ZLE05 BUY executes, the system shall persist `zle05_zscore` as the numeric z-score value at entry, alongside `zle05_population_bucket`.

FR-05: When a TREND_ZLE05 BUY executes via Path 1 and the z-score is not a number, the system shall set both `zle05_population_bucket` and `zle05_zscore` to `null`.

FR-06: When a TREND_ZLE05 BUY executes via Path 2 and neither `best.zScore` nor `best.indicators.kalman?.zScore` is a number, the system shall set both `zle05_population_bucket` and `zle05_zscore` to `null`.

FR-07: When a BUY of any signal type other than TREND_ZLE05 executes (MEAN_REVERSION, TREND_PULLBACK, EMA_RECLAIM), the system shall NOT add `zle05_population_bucket` or `zle05_zscore` to `indicators`.

FR-08: Where Path 2 TREND_ZLE05 BUY executes, the system shall prefer `best.zScore` (direct buyQueue field) over `best.indicators.kalman?.zScore` as the source for `zle05_zscore`.

FR-09: The system shall not alter `indicators` for non-TREND_ZLE05 trades — all existing fields shall pass through unchanged.

## Non-Functional Requirements

NFR-01: After implementation, `npx tsc --noEmit` shall produce zero errors.

NFR-02: After implementation, `npm run build` shall complete successfully.

NFR-03: The change shall touch exactly one file: `src/lib/claude-agent.ts`.

NFR-04: The bucket classification shall reuse the existing `getZBucket()` function — it must not be duplicated into a second, TREND_ZLE05-specific threshold helper (unlike the precedent's `getTrendPullbackPopulationBucket`, which predates `getZBucket` and duplicates its TREND_PULLBACK/TREND_ZLE05 branch).

## Constraints

C-01: This feature must not modify the Protected Zone without explicit confirmation from Amaury. `src/lib/claude-agent.ts` IS in the Protected Zone — confirmation required before implementation.

C-02: `getZBucket()` — its signature, thresholds, or behavior for any signal type — shall not be modified.

C-03: The existing `if (signalType === 'TREND_PULLBACK')` / `if (best.signalType === 'TREND_PULLBACK')` blocks and their `tp_population_bucket`/`tp_zscore` fields shall not be modified.

C-04: `TechnicalIndicators` in `src/lib/types.ts` shall not be modified — `zle05_*` fields remain untyped/dynamic JSONB keys, consistent with `tp_*` precedent.

C-05: No trading logic, gate condition (`trendZLE05Setup`, `trendQualityOkZLE05`, `adxOkZLE05`), signal detection, or exit rule shall be altered.

C-06: `src/lib/learning.ts`, `src/lib/db.ts`, and `src/lib/indicators.ts` shall not be modified.

## Out of Scope

- Dashboard display of `zle05_population_bucket` or `zle05_zscore`.
- Adding these fields to the `TechnicalIndicators` TypeScript type.
- Any database migration (JSONB is schemaless — none needed, per established precedent in this codebase).
- Backfilling the 5 existing historical TREND_ZLE05 trades — they will keep `zle05_population_bucket`/`zle05_zscore` absent; a future backfill spec (mirroring `backfill-spx-regime-open-positions`'s pattern) would be needed to reconstruct them from `indicators_at_buy.kalman.zScore`, which the prior diagnostic confirmed is available for reconstruction.
- Any change to EMA_RECLAIM or MEAN_REVERSION enrichment.
- Consolidating `getTrendPullbackPopulationBucket` and `getZBucket` into one canonical helper (the former remains a separate, slightly duplicative function for TREND_PULLBACK — not touched here).
