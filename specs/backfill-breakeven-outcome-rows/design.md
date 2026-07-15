# Design — Backfill Breakeven Outcome Rows

## Architecture Decision

This is a pure data correction, executed as direct SQL against the live Supabase
`trade_evaluations` table via the service-role key (the same read-access pattern already used
for this project's diagnostic queries — no application code path is touched, since
`insertTradeEvaluation`/`getTradeEvaluations` are unaffected by a historical data correction on
already-persisted rows). This is **not** a schema migration: the `outcome` column's type and
definition are unchanged, only 3 existing row values are corrected. No migration file is needed.

## Data Flow

1. **Pre-check**: `SELECT id, symbol, sell_timestamp, pnl_pct, outcome FROM trade_evaluations
   WHERE outcome = 'breakeven'` — confirm exactly 3 rows, matching the original diagnostic
   (WVE, OXY, XOM with their known `pnl_pct` values), and capture each row's exact `id` (UUID).
2. **Guard**: if the live result differs from the expected 3-row set in any way (extra row,
   missing row, different `pnl_pct`) — stop, report to Amaury, do not proceed to step 3. This
   guards against backfilling against a not-yet-fully-deployed code fix.
3. **Update**: execute 3 individual `UPDATE ... WHERE id = '<uuid>' ... RETURNING *` statements
   (one per row) — not a bulk `WHERE outcome = 'breakeven'` update, to avoid catching any row
   that might appear between the pre-check and the update.
4. **Post-check**: re-run the pre-check `SELECT` by the same 3 known ids — confirm
   `outcome` is now `'loss'`/`'loss'`/`'profit'` respectively, and every other column matches the
   before-snapshot exactly. Confirm `SELECT COUNT(*) FROM trade_evaluations` is still 62.
5. **Aggregate re-verification**: recalculate the TREND_ZLE05 Signal Type Breakdown and top-level
   Win Rate (via a live `/api/performance` call or an equivalent direct recalculation query) and
   confirm they now show 30.77% and 51.61% respectively, matching the diagnostic's predicted
   corrected values.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Bulk `UPDATE ... WHERE outcome = 'breakeven'` | Single simple statement | Could silently catch an unexpected new row that appeared between the pre-check and execution, mislabeling something unintended | Rejected |
| Per-row `UPDATE ... WHERE id = '<uuid>'` with `RETURNING` | Precise, auditable, matches this project's established CTE+RETURNING verification convention | Slightly more statements (3 vs. 1) | **Chosen** |
| Re-run application logic (`evaluateClosedTrade`) against historical rows | Reuses the corrected logic exactly | Massive overkill for 3 known rows; would require reconstructing `OpenPositionContext` state that may no longer exist, and would trigger an unwanted Claude API call per row (the function also generates a fresh post-mortem) | Rejected |

## Impact on Existing Files

None — this is a data-only change. No source file is created or modified.

## Protected Zone Impact

None — no code files are touched by this change.

## Database Changes

3 row-level `UPDATE` statements against the existing `trade_evaluations.outcome` column (no
schema change, no new migration). Historical data correction only, scoped to the exact 3 row ids
confirmed in the pre-check step.

## Open Questions

None — Amaury has already confirmed intent to backfill these 3 rows in the originating request;
the remaining gate is the formal spec-approval checkbox in `tasks.md` before any UPDATE runs.
