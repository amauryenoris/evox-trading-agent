# Requirements — Add atr_bucket to state_fingerprint

## Functional Requirements

FR-01: The system shall provide a new exported function, `getAtrBucket(atrPercentile: number | null): string | null`, in `src/lib/state-fingerprint.ts`, following the same null-guard-then-threshold-chain shape as `getAdxBucket`/`getMacdBucket`.
FR-02: The system shall return `null` from `getAtrBucket` when `atrPercentile` is `null` or not a finite number.
FR-03: The system shall return `'VERY_HIGH'` from `getAtrBucket` when `atrPercentile >= 0.85`.
FR-04: The system shall return `'HIGH'` from `getAtrBucket` when `atrPercentile >= 0.60` (and `< 0.85`).
FR-05: The system shall return `'MID'` from `getAtrBucket` when `atrPercentile >= 0.30` (and `< 0.60`).
FR-06: The system shall return `'LOW'` from `getAtrBucket` when `atrPercentile < 0.30`.
FR-07: The system shall add `atr_bucket: string | null` to the `TradeEvaluation.stateFingerprint` inline type (`src/lib/types.ts`), alongside the existing five fields, using the same loose `string | null` typing already used for each of them.
FR-08: The system shall populate `atr_bucket` on `indicatorsAtBuy.state_fingerprint` (the immediate-execution BUY path) using `indicators.atrPercentile`.
FR-09: The system shall populate `atr_bucket` on `bestIndicatorsAtBuy.state_fingerprint` (the ranking-queue BUY path) using `best.indicators.atrPercentile`.
FR-10: The system shall extend the inline type cast in `evaluateClosedTrade()` (`src/lib/learning.ts`) to include `atr_bucket: string | null`, so `atr_bucket` is visible to TypeScript on `evaluation.stateFingerprint` and everything downstream of it, not merely present at runtime in the JSONB.
FR-11: The system shall leave `buildPatternKey()`, `FINGERPRINT_DIMENSIONS`/`getFingerprintDimensionValue()`, and `DIMENSION_IMPORTANCE` unchanged — `atr_bucket` shall not participate in pattern-key construction or fingerprint comparison as part of this change.
FR-12: The system shall leave `adx_bucket`, `macd_bucket`, `z_bucket`, and the new `atr_bucket` typed as `string | null` — no field shall be tightened to an explicit string-literal union as part of this change.

## Non-Functional Requirements

NFR-01: `npx tsc --noEmit` shall report zero new errors after the change.
NFR-02: The change shall be confined to `src/lib/state-fingerprint.ts`, `src/lib/types.ts`, `src/lib/claude-agent.ts`, and `src/lib/learning.ts` — no other file modified, and no database migration added.

## Constraints

C-01: `src/lib/claude-agent.ts` **is** in the Protected Zone (`CLAUDE.md`). Implementation shall not begin until Amaury has given fresh, explicit, in-conversation confirmation to touch this specific file — spec approval alone does not constitute that confirmation.
C-02: `src/lib/state-fingerprint.ts`, `src/lib/types.ts`, and `src/lib/learning.ts` are not in the Protected Zone — no special confirmation required for those three files.
C-03: The system shall not modify `src/lib/risk-manager.ts` or `src/lib/indicators.ts`.
C-04: The system shall not add a database migration, a new table, or a new column — `atr_bucket` rides in the already-persisted `state_fingerprint` JSONB, on both `open_position_contexts.indicators.state_fingerprint` and `trade_evaluations.state_fingerprint`.
C-05: The system shall not change any BUY/HOLD/REJECT decision logic, gate, or threshold.

## Out of Scope

- Folding `atr_bucket` into `buildPatternKey()`'s match-key string, `FINGERPRINT_DIMENSIONS`/`getFingerprintDimensionValue()`'s comparison logic, or `DIMENSION_IMPORTANCE`'s per-signal-type gate-importance table — a separate design decision, deliberately excluded from this change (FR-11).
- Tightening `adx_bucket`/`macd_bucket`/`z_bucket`/`atr_bucket` from `string | null` to explicit string-literal unions — a separate, larger pending item (FR-12).
- Adding `atr_bucket` to `currentFingerprint` (`claude-agent.ts:1982-1989`) — analyzed in `design.md`; `currentFingerprint`'s sole consumer (`compareFingerprints` via `FINGERPRINT_DIMENSIONS`) is explicitly excluded from touching `atr_bucket` by FR-11/DO NOT, so adding the field there would be inert (never read) — decided out of scope, not merely deferred.
- Any change to `INSTRUMENT_BLACKLIST`, sizing, gates, or any trading decision — this is a pure additive observability field, following the exact precedent of `mrRiskFactors` and `requestedQty` from earlier changes this session.
