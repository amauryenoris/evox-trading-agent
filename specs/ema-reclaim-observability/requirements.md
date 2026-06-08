# Requirements — EMA_RECLAIM Observability Logging (Phase 2)

## Context

EMA_RECLAIM has only 1 completed trade in history (AMZN, -0.94%). The sample is
too small to define gates. This feature adds observability logs to collect data
across all cases — entries and non-entries alike — to identify the real edge.
Review trigger: n >= 10 completed EMA_RECLAIM trades (estimated September 2026).

## Functional Requirements

FR-01: The system shall emit a `[EMA_RECLAIM_ENTRY]` log line whenever `emaReclaimSetup` is true, including the fields: symbol, z-score, MACD value, MACD bucket, ADX, ema50GtEma200 flag, market regime, and riskFactors.

FR-02: The system shall emit a `[EMA_RECLAIM_BLOCKED]` log line whenever `hasPrevData` is true and `emaReclaimSetup` is false, including the same fields as FR-01.

FR-03: The system shall classify the MACD histogram into one of four buckets: `POSITIVE` (> 0), `MODERATE_NEG` (-2.0 < histogram <= 0), `DEEP_NEG` (histogram <= -2.0), or `NO_DATA` (null), and include this bucket in both log lines.

FR-04: The system shall compute a `riskFactors` field that is a pipe-separated string of zero or more observability dimension tokens (`EMA_STRUCTURE`, `MACD_NON_POSITIVE`, `LOW_ADX`), or the literal `NONE` when none apply, and include it in both log lines.

FR-05: Where `riskFactors` includes `EMA_STRUCTURE`, the system shall set that token when `ema50Value <= 0`, `ema200Value <= 0`, or `ema50Value <= ema200Value` (i.e., EMA50 is not above EMA200).

FR-06: Where `riskFactors` includes `MACD_NON_POSITIVE`, the system shall set that token when `macdHistogram` is non-null and `macdHistogram <= 0`.

FR-07: Where `riskFactors` includes `LOW_ADX`, the system shall set that token when `adxValue` is non-null and `adxValue < 20`.

FR-08: The system shall format all numeric log fields (z-score, MACD, ADX) with two decimal places, substituting `NA` when the value is null or undefined.

## Non-Functional Requirements

NFR-01: The observability code shall introduce zero TypeScript compiler errors (strict mode), including use of a type predicate in the `riskFactors` filter to avoid `(string | null)[]` type errors.

NFR-02: The `fmt()` helper shall be declared once, inline, at the observability block insertion point — not extracted to a module-level or shared utility.

NFR-03: The observability variables shall use only existing in-scope variables (`ema50Value`, `ema200Value`, `macdHistogram`, `zScore`, `adxValue`, `indicators.marketRegime`) — no new data fetches or indicator computations.

NFR-04: The feature shall not change `emaReclaimSetup` conditions, `hasPrevData` conditions, any other setup detection logic, `enforceExitRules()`, position sizing, or `detectMarketRegime()`.

## Constraints

C-01: This feature touches `src/lib/claude-agent.ts`, which is in the Protected Zone — changes require explicit confirmation from Amaury before implementation.

C-02: `riskFactors` tokens are observability dimensions only — they are hypotheses for future analysis, not active gates. The naming must reflect this (use `riskFactors`, not `blockedBy` or `gateFailures`).

C-03: The `[EMA_RECLAIM_BLOCKED]` condition must be `hasPrevData && !emaReclaimSetup` — no additional near-miss filter — to avoid selection bias in the collected dataset.

## Out of Scope

- Persisting observability data to Supabase or any database
- Changes to EMA_RECLAIM gate conditions (those are locked at commit 723f655)
- Changes to the `enforceExitRules()` exit logging
- Dashboard display of EMA_RECLAIM observability data
- Any gate changes based on the collected data (that is Phase 3, after n >= 10)
- Changes to MEAN_REVERSION, TREND_PULLBACK, or TREND_ZLE05 logging
