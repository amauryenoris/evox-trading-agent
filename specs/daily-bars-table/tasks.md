# Tasks — Create daily_bars table (CHANGE 1 of 2 for historical OHLC persistence)

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Protected Zone changes confirmed — N/A, no Protected Zone files touched; this spec itself is the required confirmation for the "Any DB migration" File Permission Matrix category
- [x] Database migrations drafted — see design.md → Database Changes (verbatim SQL, matches the FIX/PROMPT exactly)

## Implementation Checklist

### Phase 1 — Migration
- [x] T-01: Create `supabase/migrations/<UTC-timestamp>_create_daily_bars.sql` (timestamp format matching existing files, e.g. `20260904192707_create_daily_bars.sql`) containing exactly the `CREATE TABLE IF NOT EXISTS daily_bars (...)` statement and the `ALTER TABLE daily_bars ENABLE ROW LEVEL SECURITY;` statement specified in design.md — no additional columns, indexes, or policies.
- [x] T-02: Confirm no other file in `supabase/migrations/` is modified.
- [x] T-03: Confirm no `src/lib/`, `src/app/`, or `scripts/` file is created or modified (this CHANGE is schema-only).

### Phase 2 — Verification
- [x] T-04: Apply the migration to the database (method depends on Amaury's normal deploy process for this repo — Supabase CLI `db push`, dashboard SQL editor, or MCP `apply_migration` if the correct project becomes accessible). Done via `npx supabase db push --include-all` against the linked project `hhrtqxwonpmryziuejeq` (EVOX_STOCK) — applied together with 3 other pre-existing pending migrations, per Amaury's explicit approval to push all 4.
- [x] T-05: Verify live, via read-only query, that `daily_bars` has exactly the 11 specified columns with the specified types/nullability. Confirmed via `npx supabase gen types typescript --linked` — all 11 fields present (`id`, `symbol`, `bar_date`, `open`, `high`, `low`, `close`, `volume`, `vwap`, `trade_count`, `created_at`), nullability matches spec (`vwap`/`trade_count` nullable, rest required; `id`/`created_at` optional on Insert).
- [x] T-06: Verify live that the `UNIQUE (symbol, bar_date)` constraint exists. Confirmed via `npx supabase db query --linked` against `pg_constraint`: `daily_bars_symbol_bar_date_key` — `UNIQUE (symbol, bar_date)` — plus `daily_bars_pkey` — `PRIMARY KEY (id)`.
- [x] T-07: Verify live that RLS is enabled on `daily_bars` with zero policies. Confirmed via `pg_class.relrowsecurity = true` and an empty `pg_policies` result set for `public.daily_bars`.
- [x] T-08: Verify no other table's schema or RLS state changed as a side effect. The only unintended-vs-spec changes were the 3 other pending migrations Amaury explicitly approved pushing alongside this one (`pattern_library` key column, `open_position_contexts` trailing-stop order id, `selection_history` candidate_scores) — each modifies only its own named table, per its own migration file's content. No table outside those 4 migrations' explicit targets was touched.

## Post-Implementation

- [x] Run `/review` against this spec to verify implementation matches spec
- [x] Confirm Protected Zone files unchanged (git diff shows only the new migration file under `supabase/migrations/`; no `src/lib/` Protected Zone file touched)

## Estimated Complexity

Low — a single, fully-specified `CREATE TABLE` + `ENABLE ROW LEVEL SECURITY` migration with no application-code changes. The only open item is confirming how live post-apply verification (T-05 through T-08) will be performed, since this session's Supabase MCP connection does not currently reach this repo's actual database project (see design.md → Open Questions).
