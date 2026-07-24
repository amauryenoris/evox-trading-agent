# Design — Backfill: Merge the 19 Traceable pattern_library Rows by pattern_key

## Architecture Decision

This is a **one-time, live-data-only operation** against the already-existing `pattern_library`
table in the live Supabase project — no schema change (the `pattern_key` column/index already
exist from Prompt 2a), no application code file created or modified. The mechanism is a single
SQL statement (a CTE computing survivor/merge assignments, followed by the UPDATE and DELETE it
drives) executed directly against the database, using the same Management API access already
used to apply Prompt 2a's migration and to run every read-only verification query in this
project's diagnostics this session (`SUPABASE_ACCESS_TOKEN`, since no `pg` client or linked
Supabase CLI is available in this environment). Nothing is committed to the repository as a
result of this operation.

## Data Flow

1. Compute, for each of the 19 rows, its `pattern_key` exactly as `buildPatternKey()` would (same
   `signal_type|z_bucket|adx_bucket|macd_bucket` derivation), using each row's already-traced
   originating `trade_evaluations.state_fingerprint`.
2. Group the 19 by `(pattern_key, action)`. Confirmed result: **8 groups** — 6 with 2+ members
   (12 + 2 + 2 + 5 + 2 + 2 = wait, see exact table below), 2 singletons.
3. For each 2+-member group: pick the row with the earliest `updated_at` as survivor. Compute
   `sample_count` (sum), `win_count` (sum), `win_rate` (`win_count / sample_count`, recomputed),
   `avg_pnl_pct` (sample-count-weighted average — equivalent to a plain average here since every
   pre-existing row has `sample_count = 1`). Update the survivor's `sample_count`, `win_count`,
   `win_rate`, `avg_pnl_pct`, `pattern_key`. Leave the survivor's `id`, `description`,
   `example_reasoning`, `updated_at` untouched. Delete every other row in the group.
4. For each singleton: update only its `pattern_key` column.
5. All of the above happens as one atomic operation (single transaction, or a single CTE-driven
   statement) so a partial-failure mid-backfill cannot leave some groups merged and others not.
6. The other 46 pre-existing rows and every `trade_evaluations` row are never referenced by any
   write in this operation.

### Exact groups and expected post-merge values (independently computed, for verification)

| Group key | Rows (earliest first = survivor) | sample_count | win_count | win_rate | avg_pnl_pct |
|---|---|---|---|---|---|
| MEAN_REVERSION\|DEEP\|MID\|DEEP_NEGATIVE | **META**(survivor), AAPL(0630), INTC(0709), INTC(0716) | 4 | 3 | 0.75 | 1.436005% |
| MEAN_REVERSION\|DEEP\|MID\|NEGATIVE | **CVX(0707)**(survivor), NOK | 2 | 1 | 0.50 | -2.736398% |
| TREND_ZLE05\|CONTINUATION\|HIGH\|POSITIVE | **AAL**(survivor), OXY(0708) | 2 | 0 | 0.00 | -3.576486% |
| TREND_ZLE05\|CONTINUATION\|MID\|POSITIVE | **XOM(0713)**(survivor), AAPL(0714), OXY(0714), XOM(0714b), CVX(0720) | 5 | 2 | 0.40 | 0.475201% |
| TREND_ZLE05\|CHOP\|MID\|POSITIVE | **AMZN**(survivor), XOM(0715) | 2 | 0 | 0.00 | -1.288922% |
| MEAN_REVERSION\|STANDARD\|MID\|DEEP_NEGATIVE | **DRAM**(survivor), INTC(0721) | 2 | 1 | 0.50 | 0.656307% |
| MEAN_REVERSION\|STANDARD\|MID\|NEGATIVE | FCX(0708) — singleton, `pattern_key` set only | 1 | 0 | 0.00 | (unchanged) |
| EMA_RECLAIM\|null\|MID\|NEGATIVE | AMC — singleton, `pattern_key` set only | 1 | 0 | 0.00 | (unchanged) |

**19 rows → 8 final rows (11 rows deleted).**

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Run a single SQL statement live via the Management API, nothing committed to the repo | Matches the originating request's explicit "no code changes"/"any code file" exclusion; matches how every read-only verification query this session was already run; the before/after query output (required by VERIFY) serves as the audit trail instead of a file | No permanent, version-controlled record of the exact SQL that ran | **Chosen** |
| Add a new `supabase/migrations/*.sql` file containing the UPDATE/DELETE statements | Version-controlled, auditable, consistent with how Prompt 2a's schema change was recorded | This project's existing migrations are 100% schema-only (`ALTER TABLE`/`CREATE INDEX`/`ENABLE RLS`) — none contain row-specific DML; a migration keyed to 19 specific, point-in-time row IDs isn't a repeatable schema change and would be actively confusing to re-run later; the request explicitly lists "Any code file" under DO NOT CHANGE | Rejected |
| Add a new `scripts/backfill-pattern-library.ts`, following `backfill-spx-regime.ts`'s dry-run/`RUN_BACKFILL` style | Strong style precedent in this codebase for backfills | Also a new code file, explicitly out of scope per the request; unlike the SPX backfill (repeatable per-row logic, safe to re-run, no deletes), this operation is a one-time consolidation of a fixed, already-enumerated set of rows — a persistent script isn't a good fit for a non-repeatable operation | Rejected |
| Simple average instead of sample-count-weighted average for `avg_pnl_pct` | Simpler formula | Explicitly specified as weighted in the originating request (FR-07); also happens to produce an identical result here only because every pre-existing row has `sample_count=1` — the weighted formula is still the correct general rule and must be implemented as such for correctness beyond this specific backfill | Rejected — weighted average implemented as specified |

## Impact on Existing Files

None. This is a data-only operation — no file in the repository is created, modified, or deleted.

## Protected Zone Impact

None — no application code, migration file, or config file is touched. The *data* being modified
lives in a table that required prior authorization to alter (Prompt 2a's migration), and this
operation itself required — and received — explicit Amaury authorization in the originating
request, per `CLAUDE.md`'s File Permission Matrix treatment of database changes generally.

## Database Changes

Data only, on the already-existing `pattern_library` table: 8 rows updated (6 survivors gain new
`sample_count`/`win_count`/`win_rate`/`avg_pnl_pct`/`pattern_key` values; 2 singletons gain only a
`pattern_key` value), 11 rows deleted. No schema change. No `trade_evaluations` change.

## Open Questions

- **The FCX scope boundary (flagged in `requirements.md`'s Context, not resolved here) — and a
  more serious downstream consequence than a simple "leave it for later"**: since Prompt 2a went
  live, one new row (`pat_1784819620954_FCX`) has already been created by the working
  forward-matching logic and shares a key with one of the 19
  (`TREND_ZLE05|CONTINUATION|MID|POSITIVE`, alongside XOM/AAPL/OXY/XOM/CVX). If this backfill
  proceeds exactly as scoped (19 rows only), FCX stays a separate, un-merged row. This does
  **not** self-heal cleanly: `getPatternLibrary()` orders rows by `updated_at` descending, and
  `updatePatternLibrary()`'s lookup uses `.find()`, which returns the *first* array match. Because
  FR-09 explicitly preserves the survivor's original `updated_at` (not bumped by the merge), FCX —
  being more recently updated — would sort ahead of the newly-consolidated survivor. Any *future*
  trade producing this same key would therefore match and accumulate onto **FCX**, not onto the
  richer, backfilled survivor — permanently splitting one logical pattern across two rows instead
  of unifying it. **Needs an explicit decision from Amaury before this runs**: (a) include FCX in
  this merge group despite it being outside the strict "19 pre-existing rows" definition, (b)
  proceed as scoped and accept the ongoing split (documented here, not silently ignored), or (c)
  bump the survivor's `updated_at` as part of the merge specifically to win future tie-breaks
  (which would itself violate FR-09/the originating request's explicit "do not update it to
  reflect the merge" instruction) — my read is (a) is the cleanest fix but it must be an explicit
  choice, not something this spec assumes.
