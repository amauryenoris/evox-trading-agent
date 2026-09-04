# Requirements — Create daily_bars table (CHANGE 1 of 2 for historical OHLC persistence)

## Functional Requirements

FR-01: The system shall provide a `daily_bars` table capable of storing one row per `(symbol, bar_date)` combination.

FR-02: The system shall store, for each row, the fields needed to reconstruct a standard daily OHLCV bar: `symbol`, `bar_date`, `open`, `high`, `low`, `close`, `volume`, `vwap`, and `trade_count`.

FR-03: The system shall reject a second row for the same `(symbol, bar_date)` pair via a database-enforced uniqueness constraint, so a future upsert-based pipeline can correct or fill gaps without creating duplicates.

FR-04: The system shall record a `created_at` timestamp on each row, defaulted at insert time, without requiring the inserting caller to supply it.

FR-05: The system shall deny read/write access to `daily_bars` for any caller that is not using the Supabase service-role key.

## Non-Functional Requirements

NFR-01: The migration shall follow this repository's existing timestamp-prefixed filename convention for `supabase/migrations/`.

NFR-02: The migration shall be idempotent at the table-creation level (`CREATE TABLE IF NOT EXISTS`), consistent with the existing `position_health_snapshots` migration.

## Constraints

C-01: This feature must not modify the Protected Zone (`config.ts`, `claude-agent.ts`, `risk-manager.ts`, `indicators.ts`) without explicit confirmation from Amaury. (N/A here — this feature touches only `supabase/migrations/`.)

C-02: This feature shall add exactly one new migration file. No existing table, migration, or RLS policy may be modified.

C-03: The table shall contain exactly the columns specified in the originating FIX/PROMPT — no speculative or additional columns.

C-04: This feature shall not create `scripts/daily-bars-sync.ts`, any GitHub Actions workflow, or any `db.ts` helper function — those are explicitly deferred to CHANGE 2, a separate future spec.

C-05: RLS shall be enabled on `daily_bars` with zero explicit policies (deny-all for non-service-role callers), matching the established pattern used for `position_health_snapshots`, `selection_history`, `symbol_cooldowns`, `pattern_library_excluded`, and `mr_gate_blocked`.

## Out of Scope

- `scripts/daily-bars-sync.ts` (the pipeline that populates this table) — CHANGE 2.
- The GitHub Actions workflow that runs the pipeline — CHANGE 2.
- Any `db.ts` helper function for reading/writing `daily_bars` — CHANGE 2 will decide whether the sync script uses its own Supabase client (mirroring `position-health-check.ts`) or a new `db.ts` helper.
- Backfilling historical data into the table.
- Any RLS policy granting access beyond the service role.
