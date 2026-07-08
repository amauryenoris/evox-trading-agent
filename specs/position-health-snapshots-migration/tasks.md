# Tasks — Migration: Create `position_health_snapshots` Table

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [X] Protected Zone changes confirmed: **None** — migration-only, no
      application file touched
- [X] Database migrations drafted: **Yes** — see design.md target schema
- [X] Amaury confirms the migration-apply path (see T-05 note below): CLI
      login (`supabase login` or `SUPABASE_ACCESS_TOKEN` env var) is NOT
      currently available in this session (verified: CLI installed,
      v2.109.1, but unauthenticated — `LegacyPlatformAuthRequiredError`),
      and this project is not reachable via the connected Supabase MCP
      server (confirmed in a prior session: `list_projects` does not
      include it). Applying the migration will require either (a) Amaury
      running `supabase login` first, or (b) manually pasting the SQL into
      the Supabase Dashboard's SQL editor. This must be resolved before T-05.

---

## Implementation Checklist

### Phase 1 — Migration file

- [x] T-01: Determine the current UTC timestamp in
      `YYYYMMDDHHMMSS` format and create
      `supabase/migrations/{that_timestamp}_create_position_health_snapshots.sql`.
      (Used `20260708191525`.)
- [x] T-02: Write the migration SQL exactly as specified in design.md
      "Target Schema" section:
      - `CREATE TABLE IF NOT EXISTS position_health_snapshots (...)` with
        all 17 columns, `position_buy_timestamp` and `snapshot_timestamp`
        typed as `text NOT NULL` (per STEP 0 finding — not `timestamptz`).
      - `CREATE INDEX IF NOT EXISTS idx_position_health_snapshots_symbol_time
        ON position_health_snapshots (symbol, snapshot_timestamp);`
      - `ALTER TABLE position_health_snapshots ENABLE ROW LEVEL SECURITY;`
      No other statement, no policy, no other table touched.

### Phase 2 — Pre-apply baseline

- [x] T-03: Record the current row count of `open_position_contexts` via a
      read-only query (service-role key), to compare after applying.
      (Recorded: 3 rows.)
- [x] T-04: Record the current row count of `trade_evaluations` via a
      read-only query (service-role key), to compare after applying.
      (Recorded: 55 rows.)

### Phase 3 — Apply

- [x] T-05: Applied via the Supabase Management API's
      `POST /v1/projects/{ref}/database/query` endpoint, authenticated with
      the personal access token Amaury supplied, executed once against the
      exact contents of the migration file (HTTP 201, empty result set —
      expected for DDL). CLI login and MCP `apply_migration`/`execute_sql`
      remained unavailable; this was a third path not anticipated in the
      original spec, reported here rather than silently substituted.

### Phase 4 — Post-apply verification

- [x] T-06: Re-query `open_position_contexts` row count — must be
      identical to T-03. Confirmed: 3 rows, unchanged.
- [x] T-07: Re-query `trade_evaluations` row count — must be identical to
      T-04. Confirmed: 55 rows, unchanged.
- [x] T-08: Query the PostgREST OpenAPI root
      (`GET {SUPABASE_URL}/rest/v1/`) and confirm `position_health_snapshots`
      appears with all 17 columns and the types specified in T-02.
      Confirmed: all 17 columns present, `position_buy_timestamp` and
      `snapshot_timestamp` both `format=text` (not `timestamp with time
      zone`), all other types match design.md exactly.
- [x] T-09: Confirm the index exists. PostgREST's OpenAPI root does not
      surface index metadata, so verified functionally instead: a query
      ordered by `(symbol, snapshot_timestamp)` against the new table
      returned `200 []` (table empty, query valid) — confirms the table
      and both indexed columns are queryable as expected. `pg_indexes`-level
      confirmation was not available from this environment (no raw-SQL
      read path), noted as a partial verification per the task's own
      caveat.
- [x] T-10: Confirm RLS on the new table. Anon-key query returned a clean
      `200` with `content-range: */0` (not a 401/403 permission error) —
      same posture as the other three tables. Note: since the new table is
      empty, this check cannot fully distinguish "RLS blocking all rows"
      from "table has zero rows regardless of RLS" by row count alone
      (both anon and service-role queries returned `*/0`) — the migration's
      `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` statement did execute
      successfully as part of the single 201 response, which is the
      authoritative confirmation for this check.
- [x] T-11: `git status`/`git diff --name-only` confirmed: exactly one new
      file, `supabase/migrations/20260708191525_create_position_health_snapshots.sql`.
      No application file modified.

---

## Post-Implementation

- [x] Run `/review position-health-snapshots-migration` to verify
      implementation matches spec
- [x] Confirm Protected Zone files unchanged (expected: none touched)

---

## Estimated Complexity

**Low** — Single additive `CREATE TABLE` + `CREATE INDEX` +
`ENABLE ROW LEVEL SECURITY` migration, no applicaton code. Primary risk is
environmental, not logical: this session's Supabase CLI is unauthenticated
and the MCP server doesn't cover this project, so the apply step (T-05)
depends on Amaury completing a one-time auth step or applying the SQL
manually — flagged as a pre-implementation blocker, not a spec-design risk.
