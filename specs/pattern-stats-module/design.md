# Design — Pure pattern-stats module (setup track record + single-dimension buckets)

## Architecture Decision

This is a new, pure, I/O-free analytical layer in `src/lib/`, sitting alongside `trade-views.ts` and
`state-fingerprint.ts` and consuming only `TradeEvaluation[]` already in memory. It introduces no Protected
Zone touch, no database access, and no UI — it is CHANGE 1 of the agreed four-change Pattern Library
redesign sequence (module → dashboard view → agent context + snapshot → retire old tables), and this CHANGE
covers only the first step.

Three files, each with one responsibility:

- **`pattern-schema.ts`** — frozen constants only: `SCHEMA_FROZEN_AT`, the per-setup dimension list (with
  `kind`), the `filterDiagnostic` helper, the rule-version boundary table, and the multiple-comparisons note
  constant. No logic beyond the one filter helper.
- **`pattern-labels.ts`** — small, self-contained statistics helpers with no knowledge of `TradeEvaluation`
  shape: the Student-t lookup table, confidence-interval computation, shrinkage math, and the
  `INSUFFICIENT`/`INCONCLUSIVE`/`DIFFERS_POS`/`DIFFERS_NEG` label function. Pure number-in, number-out.
- **`pattern-stats.ts`** — orchestration: resolves each trade's fingerprint (stored vs. recomputed via
  `state-fingerprint.ts`), computes the three new bucket values (`ema50_extension`, `drop3d`, `reentry`),
  groups trades by setup and by bucket, applies viability (FR-15/16) and per-bucket stats (via
  `pattern-labels.ts` + `summarizeTrades` from `trade-views.ts`), computes the historical/forward split and
  rule-version segmentation, and exposes `buildSetupTrackRecords`, `buildBucketReports`, `getPatternStats`.

This split keeps each file well under the 300-line cap and keeps the one piece of real statistical
machinery (`pattern-labels.ts`) trivially unit-testable in isolation from any trade-shaped data.

## Data Flow

```
TradeEvaluation[]  (already in memory — no fetch here)
        │
        ▼
pattern-stats.ts: resolveFingerprint(trade)
   stored fingerprint present?  → source: 'stored', use as-is
   else → recompute via state-fingerprint.ts's getAdxBucket/getMacdBucket/getAtrBucket/getZBucket
          from trade.buyIndicators → source: 'recomputed'
   neither possible (missing raw inputs, ~2 trades) → all fingerprint-dependent dims = null
        │
        ▼
pattern-stats.ts: computeNewBucketValues(trade)
   ema50_extension_pct from buyIndicators.currentPrice / .ema50        (FR-07)
   drop3d_pct from buyIndicators.closeMinus3 / .prevClose              (FR-08)
   reentry_bucket from the trade's own buyTimestamp vs. the rest of the input list's sellTimestamps (FR-09)
   confidence_bucket → structurally unavailable (see Pre-Implementation Verification) → always skipped
        │
        ▼
pattern-stats.ts: group by setup (SCHEMA[setup].dimensions, minus skipped ones)
        │
        ├─ buildSetupTrackRecords(trades)
        │     per setup: baseline summarizeTrades(), fingerprint coverage (stored/recomputed/missing),
        │     rule-version segment summaries (FR-26-28), UNKNOWN-setup trades counted in baseline only
        │
        └─ buildBucketReports(trades, setup)
              per dimension (skip if globally unavailable, e.g. confidence_bucket):
                group trades by bucket value (nulls excluded from any bucket)
                viable := >=2 buckets with n >= MIN_BUCKET_N (trade-views.ts)              (FR-15)
                if viable, per bucket:
                  summary := summarizeTrades(bucketTrades)                                 (trade-views.ts)
                  shrunkAvgPnl := pattern-labels.ts: shrink(summary, setupBaseline, SHRINK_K=15)
                  ci95 := pattern-labels.ts: studentTCI(summary)
                  label := pattern-labels.ts: label(ci95, setupBaseline.avgPnlPct, summary.n)
                  historical/forward split by SCHEMA_FROZEN_AT, forwardVerdict (FR-23-25)
                  always paired with the setup baseline summary                            (FR-21)

getPatternStats(trades) = { setups: buildSetupTrackRecords(trades),
                             buckets: Object.fromEntries(setups.map(s => [s, buildBucketReports(trades, s)])) }
```

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| One single `pattern-stats.ts` file for schema + stats + labels | Fewer files | Would mix frozen constants, trade-shaped orchestration, and pure number math in one file, likely exceeding 300 lines and making the statistics harder to unit-test in isolation | Rejected |
| 3-file split: schema / labels / stats | Matches the file cap exactly; `pattern-labels.ts` is trade-agnostic and trivially testable; `pattern-schema.ts` is pure data, easy to review/update later without touching logic | One more file than the 2-file minimum | **Chosen** |
| Recompute every fingerprint from `buyIndicators`, ignoring the stored one | Simpler (one code path) | Explicitly contradicts FR-12 (prefer stored when present) and discards already-verified data for the 63 trades that have it | Rejected |
| Apply a multiple-comparisons correction (e.g. Bonferroni) to the bucket labels | More statistically defensible | Explicitly out of scope — the spec requires a plain disclaimer constant instead, not a correction | Rejected |
| Treat `confidence_bucket`'s total unavailability as a FAIL FAST stop | Maximally conservative | The spec's own rule (FR-10) explicitly names `confidence` among the fields to skip-and-report rather than stop on; stopping here would contradict the spec's own instruction | Rejected |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/pattern-schema.ts` | CREATE | Frozen schema constants, rule-version table, `filterDiagnostic` helper |
| `src/lib/pattern-labels.ts` | CREATE | Student-t lookup, CI, shrinkage, label function — pure number math |
| `src/lib/pattern-stats.ts` | CREATE | Fingerprint resolution, new bucket computation, grouping, viability, `buildSetupTrackRecords`/`buildBucketReports`/`getPatternStats` |
| `src/lib/__tests__/pattern-schema.test.ts`, `pattern-labels.test.ts`, `pattern-stats.test.ts` | CREATE | Vitest coverage per the spec's TESTS section |

No other file is read or written by this change. `trade-views.ts` and `state-fingerprint.ts` are imported
from, never edited. `types.ts`, `db.ts`, every Protected Zone file, every API route, every UI component, and
`package.json` are untouched.

## Protected Zone Impact

None — this feature does not require Protected Zone changes. All three new files live in `src/lib/`, which
is "touch freely" per `CLAUDE.md`'s permission matrix, and none of the forbidden files are modified.

## Database Changes

None. The module takes `TradeEvaluation[]` as a plain argument — it never queries Supabase itself.

## Pre-Implementation Verification (FAIL FAST check — already performed)

- **Does `TradeEvaluation` expose `indicators_at_buy`/`state_fingerprint`/timestamps usably?** Yes.
  `TradeEvaluation.buyIndicators: TechnicalIndicators` (= the persisted `indicators_at_buy`) includes typed
  optional fields `prevClose?`, `closeMinus2?`/`3?`/`4?` (`types.ts:124,127-129`) plus the always-present
  `currentPrice`/`ema50` — sufficient for `ema50_extension_pct` (always computable when `buyIndicators`
  exists) and `drop3d_pct` (computable per-trade when `prevClose`/`closeMinus3` are present — a per-trade
  gap, not a structural one). `TradeEvaluation.stateFingerprint` and `.buyTimestamp`/`.sellTimestamp` are
  plain typed fields. No STOP condition triggered.
- **Are `state-fingerprint.ts`'s bucket functions exported and reusable without edits?** Yes —
  `getAdxBucket`, `getMacdBucket`, `getAtrBucket`, `getZBucket` are all `export function` (confirmed by
  reading the file in full) and take only primitive/nullable-primitive arguments — directly importable. No
  STOP condition triggered.
- **Is `confidence` available on `TradeEvaluation` in any form?** No — `confidence` exists only on
  `AgentDecision.confidence` (`types.ts:169`), which is part of `AgentLogEntry.decision`, never copied into
  `indicatorsAtBuy` before `saveOpenPositionContext` (confirmed by reading every `indicatorsAtBuy.* =`
  assignment in `claude-agent.ts` — none sets `confidence`) and never a field on `TradeEvaluation` itself.
  **This does not trigger the FAIL FAST stop.** Re-reading the spec's own FAIL FAST wording against its
  ALLOWED rule #1 ("if a raw input for ... confidence is not stored ... SKIP that dimension, list it in the
  report as 'skipped: missing field X', and continue"): rule #1 explicitly names `confidence` as one of the
  fields anticipated to be potentially unavailable, with a defined graceful-skip behavior. Reading the FAIL
  FAST section as targeting structural blockers that would make the whole module infeasible (not a single
  anticipated-and-handled missing field), `confidence_bucket` is implemented as a dimension that is always
  present in `SCHEMA` (tagged `diagnostic`, per FR-03) but is **always reported as
  `skipped: missing field confidence`** for every setup, 0/113 trades — never computed. This is surfaced
  plainly in the VERIFY report so Amaury sees it, not hidden.

## Open Questions

- None. All FAIL FAST conditions were checked against the current codebase; the one real gap found
  (`confidence`) is handled by the spec's own explicit skip-and-report rule rather than stopping.
