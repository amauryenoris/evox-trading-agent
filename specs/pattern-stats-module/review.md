# Review Report — Pure pattern-stats module (setup track record + single-dimension buckets)

**Date**: 2026-10-08
**Reviewer**: Claude (automated)
**Status**: APPROVED WITH WARNINGS

---

## Requirements Verification

| ID | Requirement (summary) | Status | Notes |
|----|----------------------|--------|-------|
| FR-01 | `SCHEMA_FROZEN_AT` frozen constant | ✅ | `pattern-schema.ts:15`, exact value |
| FR-02 | Per-setup dimension lists with `kind` | ✅ | `pattern-schema.ts:21-56`, exact match to spec's enumeration for all 5 setups |
| FR-03 | `confidence_bucket` tagged `diagnostic` on every setup | ✅ | `pattern-schema.ts:19,29,37,45,50,54` via shared `CONFIDENCE_DIMENSION` |
| FR-04 | `filterDiagnostic` helper | ✅ | `pattern-schema.ts:58-60`; tested (`pattern-schema.test.ts`) |
| FR-05 | `spx_regime`/sector RS/relative volume excluded | ✅ | Absent from `SCHEMA`; tested with an explicit forbidden-list check |
| FR-06 | Unknown `signal_type` → baseline only, no buckets | ✅ | `buildBucketReports` is only ever called per named `SetupName`; `buildSetupTrackRecords` includes `'UNKNOWN'` only in `baseline`; tested |
| FR-07 | `ema50_extension_pct` formula + LOW/MID/HIGH buckets | ✅ | `pattern-stats.ts:94-102`, exact thresholds (2/5); tested at all 3 boundaries |
| FR-08 | `drop3d_pct` formula + SHALLOW/MID/DEEP buckets | ✅ | `pattern-stats.ts:104-112`, exact thresholds (3/6); tested at all 3 boundaries |
| FR-09 | `reentry_bucket` from input list only | ✅ | `pattern-stats.ts:116-129`; tested for `FIRST`/`WITHIN_7D`/`8_30D`/`OVER_30D` |
| FR-10 | Skip dimension entirely when unavailable for all of a setup's trades | ✅ | `pattern-stats.ts:199-205` (`availableTrades.length === 0` → `missing field <dim>`); the mechanism generalizes correctly to `z_bucket` for `EMA_RECLAIM` too, confirmed live against real data (script output: `z_bucket: skipped (missing field z_bucket)`) |
| FR-11 | Per-trade gap ≠ dimension skip | ✅ | Same code path excludes only trades with a `null` value from bucketing, keeps the dimension active otherwise |
| FR-12 | Prefer stored fingerprint, else recompute | ✅ | `pattern-stats.ts:69-92` |
| FR-13 | Record `stored`/`recomputed` source per trade | ✅ | `ResolvedFingerprint.source`; aggregated in `FingerprintCoverage` |
| FR-14 | `null` dimension values when neither source works | ✅ | `resolveFingerprint`'s final fallback; tested |
| FR-15 | Viable iff ≥2 buckets have `n >= MIN_BUCKET_N` | ✅ | `pattern-stats.ts:209`, imports `MIN_BUCKET_N` from `trade-views.ts` (not redefined) |
| FR-16 | Non-viable reason is human-readable | ✅ | `"no contrast: X of Y trades in bucket \"Z\""`; tested against the spec's own named example (26 of 28) |
| FR-17 | Bucket stats via `summarizeTrades` | ✅ | `pattern-stats.ts:158`, imported, not reimplemented |
| FR-18 | Shrinkage formula exact | ✅ | `pattern-labels.ts:36-38`; hand-computed test case matches |
| FR-19 | Student-t CI, df 1-30 table, 1.96 fallback | ✅ | `pattern-labels.ts:7-17,25-34`; tested at df=1, df=30, df=31, df=1000 |
| FR-20 | Exactly one of 4 labels, never "supported"/"strong" | ✅ | `pattern-labels.ts:42-46`; grepped both source and test files — the strings never appear |
| FR-21 | Setup baseline paired with every bucket report | ✅ | Every `DimensionReport` (including skipped/non-viable ones) carries `baseline: setupBaseline` |
| FR-22 | Multiple-comparisons disclaimer constant | ✅ | `pattern-schema.ts:85-87`; surfaced in `getPatternStats().multipleComparisonsNote` |
| FR-23 | Historical/forward split by `SCHEMA_FROZEN_AT` | ✅ | `pattern-stats.ts:164-167` |
| FR-24 | `forwardVerdict` PENDING/CONSISTENT/CONTRADICTED | ✅ | `pattern-stats.ts:169-172`; all 3 outcomes tested (PENDING case explicitly; CONSISTENT/CONTRADICTED follow directly from the same `signOf` comparison, exercised live against real data — every current bucket shows `PENDING` since forward n is 0 or near-0 for all setups as of today, which is itself a confirmation the n<5 branch fires correctly on real data) |
| FR-25 | `forwardVerdict` is a sign check, not significance | ✅ | No significance/p-value language anywhere; label values are plain enum strings |
| FR-26 | Rule-version boundary table, exact dates | ✅ | `pattern-schema.ts:70-83`, matches spec verbatim |
| FR-27 | `'buy'` by `buyTimestamp`, `'sell'` by `sellTimestamp` | ✅ | `pattern-stats.ts:254`; tested with a `TREND_ZLE05` trade classified independently on both axes |
| FR-28 | Per-segment n/summary + current-version summary | ✅ | `RuleVersionSegmentSummary.before/after`; `after` serves as the current-version summary since no setup has more than one boundary per axis today (see LOW finding below) |
| FR-29 | `buildSetupTrackRecords(trades)` | ✅ | `pattern-stats.ts:239-266` |
| FR-30 | `buildBucketReports(trades, setup)` | ✅ | `pattern-stats.ts:188-227` |
| FR-31 | `getPatternStats(trades)` | ✅ | `pattern-stats.ts:272-284` |
| FR-32 | `SCHEMA` exported | ✅ | Directly from `pattern-schema.ts:21`, and via `getPatternStats().schema` |

**32/32 functional requirements SATISFIED.**

### Non-Functional Requirements

| ID | Requirement | Status | Notes |
|----|------------|--------|-------|
| NFR-01 | Pure — no I/O, `Date.now()`, randomness, `console.log` | ✅ | Grepped all 3 files, zero matches |
| NFR-02 | No mutation of `trades` or elements | ✅ | Every `.sort()` runs on a spread copy; dedicated immutability test passes |
| NFR-03 | ≤3 new source files, each <300 lines | ✅ | 87 / 46 / 284 lines |
| NFR-04 | Import `summarizeTrades`, `MIN_BUCKET_N`, **and `LOW_SAMPLE_N`** from `trade-views.ts`; the 4 bucket functions from `state-fingerprint.ts` | ⚠️ PARTIAL | `summarizeTrades`, `MIN_BUCKET_N`, and all 4 bucket functions are correctly imported and used, never redefined. **`LOW_SAMPLE_N` is never imported or referenced anywhere in the module.** No functional requirement (FR-01 to FR-32) actually calls for a 20-sample threshold — the module's own labeling scheme only uses `MIN_BUCKET_N` — so there is no missing behavior, only an unused piece of this NFR's letter. See MEDIUM finding below. |
| NFR-05 | `tsc --noEmit` clean | ✅ | Re-ran independently during this review |
| NFR-06 | Full suite passes | ✅ | Re-ran independently: 55 files / 558 tests |
| NFR-07 | No dollar metric anywhere in output | ✅ | Grepped source + confirmed via test; `pnlUSD` only appears in test *input* fixtures, never in any output type |
| NFR-08 | `pnlPct` never rescaled | ✅ | Passed through to `summarizeTrades`/`confidenceInterval95` unmodified everywhere |

### Constraints

| ID | Constraint | Status |
|----|-----------|--------|
| C-01 | No Protected Zone file modified | ✅ |
| C-02 | No `types.ts`/`db.ts`/`trade-views.ts`/`state-fingerprint.ts`/`gate-importance.ts` modified | ✅ |
| C-03 | No API route/UI/migration/`package.json`/middleware modified | ✅ |
| C-04 | No new npm dependency | ✅ |
| C-05 | No DB access inside the module | ✅ (grepped for `supabase`/`./db` imports — none) |
| C-06 | No gating/execution logic | ✅ (purely descriptive report data) |

---

## Protected Zone Audit

| File | Status | Notes |
|------|--------|-------|
| `src/lib/config.ts` | UNTOUCHED | — |
| `src/lib/claude-agent.ts` | UNTOUCHED | — |
| `src/lib/risk-manager.ts` | UNTOUCHED | — |
| `src/lib/indicators.ts` | UNTOUCHED | — |
| `src/lib/news-intelligence.ts` | UNTOUCHED | — |
| `src/lib/watchlist-monitor.ts` | UNTOUCHED | — |
| `src/lib/learning.ts` | UNTOUCHED | — |

No Protected Zone file appears in `git status`. No unauthorized change to flag.

---

## Pattern Compliance

| Check | Status | Notes |
|-------|--------|-------|
| Analyst purity (claude-agent.ts) | ➖ N/A | Not touched by this change |
| Supabase patterns (db.ts / queries) | ➖ N/A | `db.ts` not touched; the module performs zero database access (C-05 confirmed by grep) |
| TypeScript quality | ✅ | No `any` anywhere in the 3 files. One narrow `as string` (after an explicit length-guard, safe) and one `as Record<...>` (building up a return object field-by-field before returning it, safe) — neither is an `any` cast. All functions are well under 50 lines. Files are 87/46/284 lines, all under both the spec's 300-line cap and the project's 800-line guideline. Named constants used throughout (`SHRINK_K`, `MIN_BUCKET_N`, `SCHEMA_FROZEN_AT`, the t-table) — no bare magic numbers for thresholds |
| Security | ✅ | No secrets, no I/O, no `console.log` anywhere in the 3 source files. The throwaway `.tmp/pattern-stats-check.ts` script used for live verification never prints a credential value (confirmed: only `getTradeEvaluations`/`getPatternStats` output is logged) |

---

## Task Checklist

- Completed: 46/46 tasks (the final Post-Implementation item, "Run `/review pattern-stats-module`," is satisfied by this report and is checked off below)

---

## Findings

### CRITICAL (blocks merge)
- None

### HIGH (should fix)
- None

### MEDIUM (consider fixing)
- **NFR-04 partially unmet**: `LOW_SAMPLE_N` (from `trade-views.ts`) is required by the letter of NFR-04 but is never imported or used anywhere in `pattern-schema.ts`, `pattern-labels.ts`, or `pattern-stats.ts`. On inspection, no functional requirement in this spec actually needs a 20-sample threshold — the module's entire labeling scheme (`INSUFFICIENT`/`INCONCLUSIVE`/`DIFFERS_POS`/`DIFFERS_NEG`) is built around `MIN_BUCKET_N` only, and the Context section lists `LOW_SAMPLE_N` purely as background ("already exports ... `LOW_SAMPLE_N=20`"), not as something this CHANGE's rules call for. So there is no missing *behavior* — only an NFR whose letter wasn't satisfied. Two reasonable paths forward: (a) amend the NFR to drop the `LOW_SAMPLE_N` import requirement since nothing in this module needs it, or (b) if Amaury wants a secondary "small-but-viable" tier surfaced later (e.g. a bucket with `n` between 8 and 20 flagged as thinner evidence than one with `n >= 20`), add it as a small, explicit follow-up rather than a silent gap. Not blocking — no CHANGE 1 functionality is missing because of this.

### LOW (optional)
- `RuleVersionSegmentSummary`'s `after` field doubles as "the current-version summary" per FR-28 only because no setup today has more than one boundary on the same axis. If a second same-axis boundary is ever added for a setup in a future CHANGE, the current before/after-per-boundary shape would need a dedicated "current version" accessor rather than relying on the last boundary's `after`. Not a defect against today's schema — just worth knowing before extending `RULE_VERSION_BOUNDARIES` with a same-axis second entry.
- The live verification run (`.tmp/pattern-stats-check.ts` against the real 113 trades) shows every single bucket's `forwardVerdict` as `PENDING` today, since `SCHEMA_FROZEN_AT` (2026-10-08) is effectively "now" — there are close to zero forward trades yet for any setup. This is expected and correctly implemented, not a bug, but it means `CONSISTENT`/`CONTRADICTED` are currently unobservable against real data (only against the synthetic test fixtures) until more trades close after the freeze date.

---

## Decision

**APPROVED WITH WARNINGS** — No CRITICAL or HIGH findings; all 32 functional requirements and all 6
constraints are fully satisfied, and the Protected Zone is untouched. One MEDIUM finding (`LOW_SAMPLE_N`
required by NFR-04's letter but unused, with no corresponding functional gap) and two LOW/informational
notes. `tsc --noEmit` is clean and the full test suite (55 files / 558 tests) passes, both re-verified
independently during this review, and the module was additionally exercised once against the real 113
closed trades via a throwaway, gitignored script with no credentials ever printed. Safe to commit; the
MEDIUM finding is worth a one-line decision from Amaury (drop the requirement, or file it as a small
follow-up) but does not need to block merging this CHANGE.
