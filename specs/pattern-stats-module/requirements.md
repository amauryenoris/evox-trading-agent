# Requirements — Pure pattern-stats module (setup track record + single-dimension buckets)

## Context

Redesign agreed 2026-10-08: the Pattern Library becomes a DERIVED view over `trade_evaluations`, computed
by a pure module rather than updated incrementally by Claude. STEP 0 (2026-10-07/08) found: 113 closed
trades; `state_fingerprint` stored on 63, recomputable from `indicators_at_buy` for 111 of 113 (2 trades lack
the raw inputs entirely); `state-fingerprint.ts` already exports the bucket functions and thresholds (ADX
18/25, MACD 0/-2, ATR percentile 0.30/0.60/0.85; `getZBucket` returns `null` for `EMA_RECLAIM` and
`TREND_PULLBACK_3DAY` by design, confirmed with real data). Gates per setup match `gate-importance.ts`.
`spx_regime` has zero variance across all fingerprints (always `BULL`). Sector RS and "relative volume" are
not usable for this analysis (sector RS is never reliable in the current dataset — all stored values predate
the 2026-10-06 macro-bars fix; relative volume is never persisted per-trade at all). Per-trade `pnlPct`
standard deviation is ~5.2%, so small buckets are noise-prone — the module informs, it never gates, and must
never use language implying statistical confirmation ("supported", "strong"). `trade-views.ts` (approved,
CHANGE 1) already exports `summarizeTrades` and the constants `MIN_BUCKET_N=8`, `LOW_SAMPLE_N=20`. `pnlPct`
is already in percent units. Percent metrics only — no dollar totals, no profit factor.

**Pre-Implementation verification already performed (see `design.md` for detail): `TradeEvaluation` exposes
`buyIndicators` (= `indicators_at_buy`, typed as `TechnicalIndicators`, including `prevClose`,
`closeMinus2`/`3`/`4`, `ema50`, `currentPrice` as named optional fields), `stateFingerprint`, `buyTimestamp`,
`sellTimestamp` — all usable. `state-fingerprint.ts`'s four bucket functions are all exported. `confidence`
is structurally absent from `TradeEvaluation` and from `TechnicalIndicators` (it exists only on the
never-persisted `AgentDecision.confidence`) — this does not trigger a FAIL FAST stop, because ALLOWED rule
(see below) explicitly anticipates and handles exactly this case via a graceful per-dimension skip.**

## Functional Requirements

### Schema (frozen constants)

FR-01: The system shall export a frozen constant `SCHEMA_FROZEN_AT` with the value
`'2026-10-08T00:00:00-04:00'`.

FR-02: The system shall export, for each of the five setups (`MEAN_REVERSION`, `TREND_PULLBACK`,
`TREND_ZLE05`, `TREND_PULLBACK_3DAY`, `EMA_RECLAIM`), the list of dimensions applicable to it, each tagged
with a `kind` of `'confirmatory'`, `'exploratory'`, or `'diagnostic'`, exactly as enumerated in the Context
above (MEAN_REVERSION: `adx_bucket`/`z_bucket`/`market_regime` confirmatory, `atr_bucket`/`macd_bucket`/
`reentry_bucket` exploratory; TREND_PULLBACK and TREND_ZLE05: `adx_bucket`/`macd_bucket`/`z_bucket`
confirmatory, `ema50_extension_bucket`/`reentry_bucket` exploratory; TREND_PULLBACK_3DAY:
`drop3d_bucket`/`reentry_bucket` exploratory only; EMA_RECLAIM: `z_bucket` confirmatory only).

FR-03: The system shall tag `confidence_bucket` as `'diagnostic'` for every setup.

FR-04: The system shall export a helper function that filters out every `'diagnostic'`-kind dimension from
a given schema entry, for use by any future caller that must never show diagnostic dimensions to Claude.

FR-05: The system shall exclude `spx_regime`, sector RS, and relative volume from the schema entirely —
these shall not appear as a dimension for any setup.

FR-06: Where a trade's `signal_type` is not one of the five known setups, the system shall report it only
in that trade's contribution to the baseline/overall count — it shall not be assigned any dimension buckets.

### New bucket definitions

FR-07: The system shall compute `ema50_extension_pct` as `(currentPrice - ema50) / ema50 * 100` and bucket
it as `LOW` (`< 2`), `MID` (`2` to `< 5`), or `HIGH` (`>= 5`).

FR-08: The system shall compute `drop3d_pct` as the percent decline from the close 3 trading days before
entry to the last close before entry (a positive number representing a decline) and bucket it as
`SHALLOW` (`< 3`), `MID` (`3` to `< 6`), or `DEEP` (`>= 6`).

FR-09: The system shall compute `reentry_bucket` for a trade as the number of days between that trade's
`buyTimestamp` and the most recent `sellTimestamp` of any other trade of the same symbol in the same input
list that closed before that `buyTimestamp`, bucketed as `FIRST` (no such prior trade exists in the input),
`WITHIN_7D`, `8_30D`, or `OVER_30D` — computed entirely from the input trade list, with no additional data
source.

FR-10: Where a raw input required for `ema50_extension_bucket`, `drop3d_bucket`, or `confidence_bucket` is
not present anywhere in `TradeEvaluation`/`TechnicalIndicators` for a given setup's trades, the system shall
skip that dimension for that setup entirely and report it as `skipped: missing field <name>` rather than
computing partial or zero buckets for it.

FR-11: Where a raw input required for `ema50_extension_bucket` or `drop3d_bucket` is present for some trades
of a setup but missing (`null`/`undefined`) for others, the system shall compute the bucket only for the
trades that have the input, treating the others as contributing a `null` bucket value for that dimension
(this is a per-trade gap, not a reason to skip the whole dimension).

### Fingerprint source

FR-12: The system shall use a trade's stored `stateFingerprint` when it is present, and shall otherwise
recompute it from `buyIndicators` using the bucket functions imported from `state-fingerprint.ts`.

FR-13: The system shall record, per trade, whether its fingerprint came from `'stored'` or `'recomputed'`.

FR-14: Where a trade has neither a stored fingerprint nor enough raw inputs in `buyIndicators` to recompute
one, the system shall record that trade's fingerprint-dependent dimension values as `null` rather than
throwing or substituting a default.

### Per-dimension viability

FR-15: The system shall consider a dimension viable for a setup only when at least two of its buckets each
have `n >= MIN_BUCKET_N` (imported from `trade-views.ts`).

FR-16: Where a dimension is not viable, the system shall report `viable: false` with a human-readable reason
(e.g. identifying that nearly all trades fall in a single bucket).

### Per-bucket statistics

FR-17: The system shall compute each bucket's base statistics via `summarizeTrades` (imported from
`trade-views.ts`), not a reimplementation.

FR-18: The system shall compute each bucket's `shrunkAvgPnl` as
`(n * bucketAvg + SHRINK_K * setupAvg) / (n + SHRINK_K)` with `SHRINK_K = 15`.

FR-19: The system shall compute a 95% confidence interval for each bucket's mean `pnlPct` using a Student's
t critical value looked up for degrees of freedom 1 through 30, falling back to `1.96` for degrees of
freedom above 30.

FR-20: The system shall label each bucket as exactly one of `INSUFFICIENT` (`n < MIN_BUCKET_N`),
`INCONCLUSIVE` (the bucket's confidence interval contains the setup's overall baseline average `pnlPct`),
`DIFFERS_POS`, or `DIFFERS_NEG` (the confidence interval excludes the baseline average, above or below it
respectively) — the system shall never produce a label implying statistical confirmation such as
"supported" or "strong".

FR-21: The system shall include the setup's overall baseline summary alongside every bucket report, for
every dimension.

FR-22: The system shall export a constant note stating plainly that these labels are not corrected for
multiple comparisons.

### Forward validation

FR-23: The system shall split each bucket's trades into a historical group (`buyTimestamp <
SCHEMA_FROZEN_AT`) and a forward group (`buyTimestamp >= SCHEMA_FROZEN_AT`), each summarized independently.

FR-24: The system shall compute a `forwardVerdict` of `PENDING` when the forward group has fewer than 5
trades, `CONSISTENT` when the forward group's average `pnlPct` differs from the forward setup baseline in
the same direction as the historical bucket differed from the historical setup baseline, and `CONTRADICTED`
when the direction is opposite.

FR-25: The system shall treat `forwardVerdict` strictly as a sign check — it shall not claim statistical
significance anywhere in its output or naming.

### Rule versions

FR-26: The system shall export, per setup, zero or more rule-version boundaries, each with an `appliesTo` of
`'buy'` or `'sell'` and an effective date: `TREND_PULLBACK` — `2026-06-04` (MACD floor, `buy`);
`TREND_ZLE05` — `2026-06-04` (adaptive ADX, `buy`) and `2026-10-05` (new exit rules, `sell`);
`MEAN_REVERSION` — `2026-06-16` (ranging ADX gate, `buy`); `TREND_PULLBACK_3DAY` and `EMA_RECLAIM` — none.

FR-27: The system shall classify a trade against a `'buy'`-type boundary using its `buyTimestamp`, and
against a `'sell'`-type boundary using its `sellTimestamp`.

FR-28: The system shall report, per setup, the trade count and summary for each rule-version segment implied
by its boundaries, plus a summary scoped to the current (most recent) version of each boundary axis.

### Exported API

FR-29: The system shall export `buildSetupTrackRecords(trades)`, returning one track record per setup
(including the baseline summary, fingerprint coverage broken down by `stored`/`recomputed`/`missing`, and
the rule-version segment summaries from FR-28).

FR-30: The system shall export `buildBucketReports(trades, setup)`, returning the per-dimension viability
and per-bucket reports (FR-15 to FR-25) for one setup.

FR-31: The system shall export `getPatternStats(trades)` combining `buildSetupTrackRecords` and
`buildBucketReports` for every setup into one top-level result.

FR-32: The system shall export the `SCHEMA` constant structure described in FR-01 to FR-06.

## Non-Functional Requirements

NFR-01: Every exported function shall be pure — no I/O, no `Date.now()`, no `Math.random()` or other
non-deterministic input, no `console.log`, and no reliance on ambient state.

NFR-02: No exported or internal function shall mutate its `trades` input array or any of its elements.

NFR-03: The implementation shall span at most 3 new source files (`src/lib/pattern-schema.ts`,
`src/lib/pattern-stats.ts`, and optionally `src/lib/pattern-labels.ts`), each under 300 lines, plus test
files.

NFR-04: The implementation shall import `summarizeTrades`, `MIN_BUCKET_N`, and `LOW_SAMPLE_N` from
`trade-views.ts` and the four bucket functions from `state-fingerprint.ts` — it shall not redefine or copy
their logic or thresholds.

NFR-05: `npx tsc --noEmit` shall report zero errors after this change.

NFR-06: The full Vitest suite shall pass after this change.

NFR-07: No dollar-denominated metric (`pnlUSD`, profit factor, or any derivative) shall appear anywhere in
this module's exported output.

NFR-08: `pnlPct` shall never be rescaled (multiplied or divided) anywhere in this module.

## Constraints

C-01: This feature shall not modify any Protected Zone file (`config.ts`, `claude-agent.ts`,
`risk-manager.ts`, `indicators.ts`, `news-intelligence.ts`, `watchlist-monitor.ts`, `learning.ts`).

C-02: This feature shall not modify `types.ts`, `db.ts`, `trade-views.ts`, `state-fingerprint.ts`, or
`gate-importance.ts`.

C-03: This feature shall not modify any API route, UI component, migration, `package.json`, or middleware.

C-04: This feature shall not introduce any new npm dependency.

C-05: This feature shall not perform any database access from within the new module(s).

C-06: This feature shall not implement any trade-gating or trade-execution logic — it is observational only.

## Out of Scope

- Wiring this module into `learning.ts`'s prompt-building, the dashboard, or any API route (future
  CHANGEs per the agreed sequence).
- Retiring the `pattern_library`/`pattern_library_excluded` tables (future CHANGE).
- Correcting for multiple comparisons statistically (explicitly disclaimed, not implemented).
- Any dimension or setup not named in this spec's schema.
- Backfilling or recomputing anything into the database — this module only transforms data already passed
  to it in memory.
