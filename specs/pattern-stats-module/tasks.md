# Tasks — Pure pattern-stats module (setup track record + single-dimension buckets)

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Protected Zone changes confirmed (if applicable) — N/A, none touched
- [x] Database migrations drafted (if applicable) — N/A, none needed

## Implementation Checklist

### Phase 1 — Schema (`src/lib/pattern-schema.ts`)
- [x] T-01: Export `SCHEMA_FROZEN_AT = '2026-10-08T00:00:00-04:00'`.
- [x] T-02: Export the per-setup dimension schema (FR-02/03/05) — each setup's dimension list tagged
  `'confirmatory' | 'exploratory' | 'diagnostic'`, `confidence_bucket` as `diagnostic` on every setup,
  `spx_regime`/sector RS/relative volume absent entirely.
- [x] T-03: Export `filterDiagnostic(dimensions)` — drops every `diagnostic`-kind entry (FR-04).
- [x] T-04: Export the rule-version boundary table (FR-26): `TREND_PULLBACK` buy/2026-06-04;
  `TREND_ZLE05` buy/2026-06-04 and sell/2026-10-05; `MEAN_REVERSION` buy/2026-06-16; empty arrays for
  `TREND_PULLBACK_3DAY`/`EMA_RECLAIM`.
- [x] T-05: Export the multiple-comparisons disclaimer constant (FR-22).

### Phase 2 — Pure statistics helpers (`src/lib/pattern-labels.ts`)
- [x] T-06: Student-t two-tailed 95% critical-value lookup table for df 1–30, falling back to `1.96`
  above df 30 (FR-19).
- [x] T-07: `confidenceInterval95(values)` — mean ± t-critical × (sd / sqrt(n)), operating on the bucket's
  raw `pnlPct` values (trade-agnostic; the call site in `pattern-stats.ts` extracts the array).
- [x] T-08: `shrink(bucketAvg, bucketN, setupAvg, SHRINK_K = 15)` implementing FR-18's formula exactly.
- [x] T-09: `labelBucket(ci95, baselineAvg, n)` → `'INSUFFICIENT' | 'INCONCLUSIVE' | 'DIFFERS_POS' |
  'DIFFERS_NEG'` per FR-20 (n < `MIN_BUCKET_N` imported from `trade-views.ts` takes priority over the CI
  check).

### Phase 3 — Fingerprint resolution + new bucket dimensions (`src/lib/pattern-stats.ts`, part 1)
- [x] T-10: `resolveFingerprint(trade)` — stored fingerprint if present (FR-12/13), else recompute via
  `state-fingerprint.ts`'s four exported functions from `trade.buyIndicators`, else all-null with
  `source: 'missing'`.
- [x] T-11: `computeEma50ExtensionBucket(trade)` per FR-07; null when `buyIndicators.ema50`/`currentPrice`
  unavailable.
- [x] T-12: `computeDrop3dBucket(trade)` per FR-08; null when `prevClose`/`closeMinus3` unavailable
  (per-trade gap, FR-11 — dimension itself stays active).
- [x] T-13: `computeReentryBucket(trade, allTrades)` per FR-09 — most recent same-symbol `sellTimestamp`
  strictly before this trade's `buyTimestamp`, among `allTrades`; `FIRST` if none.
- [x] T-14: Confirm `confidence_bucket` has no raw-input source anywhere in `TradeEvaluation`/
  `TechnicalIndicators` and is therefore always reported as `skipped: missing field confidence` (FR-10) —
  no computation attempted for it.

### Phase 4 — Grouping, viability, and per-bucket reports (`src/lib/pattern-stats.ts`, part 2)
- [x] T-15: Group trades by setup; `UNKNOWN`/unrecognized `signal_type` counted in the setup-level baseline
  list only, never assigned dimension buckets (FR-06).
- [x] T-16: `buildBucketReports(trades, setup)` — for each non-skipped dimension in `SCHEMA[setup]`, group
  by bucket value (excluding trades with a `null` value for that dimension from any bucket), compute
  viability (FR-15/16: viable iff ≥2 buckets have `n >= MIN_BUCKET_N`), and for each bucket when viable:
  `summarizeTrades` (from `trade-views.ts`) + `shrunkAvgPnl` + `ci95` + `label` + the paired setup baseline
  (FR-17 to FR-22).
- [x] T-17: Historical/forward split per bucket by `SCHEMA_FROZEN_AT` on `buyTimestamp`, plus
  `forwardVerdict` (FR-23/24/25).

### Phase 5 — Track records and top-level API (`src/lib/pattern-stats.ts`, part 3)
- [x] T-18: `buildSetupTrackRecords(trades)` — per setup: baseline `summarizeTrades`, fingerprint coverage
  (`stored`/`recomputed`/`missing` counts from T-10), rule-version segment summaries + current-version
  summary (FR-27/28, classifying `'buy'` boundaries by `buyTimestamp` and `'sell'` boundaries by
  `sellTimestamp`).
- [x] T-19: `getPatternStats(trades)` combining `buildSetupTrackRecords` and `buildBucketReports` for every
  setup (FR-31); re-exports `SCHEMA` via its `.schema` field and `pattern-schema.ts`'s own direct export
  (FR-32) — kept inline rather than a redundant re-export line to stay under the 300-line file cap.
- [x] T-20: Verify no function in any of the 3 files mutates its `trades`/array arguments (spread/slice
  before any sort or filter that could otherwise mutate).

### Phase 6 — Tests (vitest, house style, AAA)
- [x] T-21: Viability rule — one dominant bucket (e.g. ZLE05-shaped `macd_bucket` with 26 of 28 in one
  bucket) → `viable: false` with a reason mentioning the dominant share.
- [x] T-22: Shrinkage math — exact formula check against hand-computed values for at least 2 cases.
- [x] T-23: CI + label cases — all four labels reachable (`INSUFFICIENT`, `INCONCLUSIVE`, `DIFFERS_POS`,
  `DIFFERS_NEG`), including a df > 30 case using the `1.96` fallback.
- [x] T-24: Forward/historical split by `buyTimestamp` relative to `SCHEMA_FROZEN_AT`, and all three
  `forwardVerdict` outcomes (including the `PENDING` n<5 case).
- [x] T-25: Rule-version assignment — a `TREND_ZLE05` trade classified by `buyTimestamp` against the buy
  boundary and independently by `sellTimestamp` against the sell boundary (confirms the two axes are
  independent, per FR-27).
- [x] T-26: Recompute fallback — stored fingerprint preferred when present; recomputed when absent but
  inputs available; `null` dimension values when inputs are missing (~2-trade case).
- [x] T-27: `reentry_bucket` calculation — `FIRST`, `WITHIN_7D`, `8_30D`, `OVER_30D` each reachable from a
  constructed trade list.
- [x] T-28: `filterDiagnostic` helper removes `confidence_bucket` (and nothing else) from a setup's schema
  entry.
- [x] T-29: `pnlPct` never rescaled anywhere in the module's output (assert raw equality, not just
  closeness).
- [x] T-30: No dollar field (`pnlUSD`, profit factor, or any derivative) appears anywhere in
  `getPatternStats`'s output shape.
- [x] T-31: Input immutability — JSON snapshot of the input `trades` array before and after calling every
  exported function, asserted unchanged.
- [x] T-32: `confidence_bucket` is reported as `skipped: missing field confidence` for every setup (the
  structural-gap case from the Pre-Implementation Verification).

### Phase 7 — Verification
- [x] T-33: Run `npx tsc --noEmit` — must be clean.
- [x] T-34: Run the full Vitest suite — must pass.
- [x] T-35: Write a throwaway, read-only script in `.tmp/` (gitignored, never print keys) that fetches the
  real `trade_evaluations` and runs `getPatternStats` over them once; print a compact per-setup table: n,
  fingerprint coverage, each dimension's viable/not-viable (with reason), each viable bucket's n/avg/label/
  forwardVerdict, and the list of skipped dimensions.
- [x] T-36: Paste that script's output into the implementation report.
- [x] T-37: List every file created; confirm via `git status`/diff that nothing outside
  `src/lib/pattern-schema.ts`, `src/lib/pattern-labels.ts`, `src/lib/pattern-stats.ts`, their test files, and
  the throwaway `.tmp/` script changed.
- [x] T-38: State plainly anything that could not be run in this environment.

## Post-Implementation

- [x] Run `/review pattern-stats-module` to verify implementation matches spec
- [x] Confirm Protected Zone files unchanged (`config.ts`, `claude-agent.ts`, `risk-manager.ts`,
  `indicators.ts`, `news-intelligence.ts`, `watchlist-monitor.ts`, `learning.ts`, any migration)
- [x] Confirm `types.ts`, `db.ts`, `trade-views.ts`, `state-fingerprint.ts`, `gate-importance.ts` unchanged
- [x] Confirm no API route, UI component, or `package.json` changed
- [x] Confirm no new npm dependency was added

## Estimated Complexity

**Medium** — no Protected Zone, no I/O, and the arithmetic (shrinkage, Student-t CI) is well-defined and
small, but there are many independent moving parts (5 setups × up to 6 dimensions, 3 new bucket
computations with partial-availability handling, a two-axis rule-version system, and a forward/historical
split) that all have to compose correctly and be covered by tests without the module ever overstating what
~5-40-trade buckets can actually tell us.
