# Requirements — Migration: Create `position_health_snapshots` Table

## Background

The Position Health Monitor (a future daily script, Prompt 3/4) needs a
storage target for periodic re-evaluation snapshots of currently-open
positions: entry-time state (reference) alongside freshly-recomputed
current state (ADX/MACD/z-score buckets, SPX regime). This is purely
additive observability history — one row per (symbol, snapshot timestamp)
— and does not replace or modify `open_position_contexts` (which remains
the live/entry-time source of truth) or any other existing table.

Live schema verification (STEP 0, this session) confirmed a project-wide
convention that this spec must follow: business-domain timestamp columns
(`open_position_contexts.buy_timestamp`, `trade_evaluations.buy_timestamp`
/`sell_timestamp`, `agent_log.timestamp`) are all stored as `text`
(ISO-8601 strings written by application code via `new Date().toISOString()`),
not `timestamptz` — only the auto-generated `created_at` audit columns on
`trade_evaluations`/`agent_log` use `timestamptz`. RLS is enabled on all
three existing tables with no anon-accessible policy (empirically confirmed:
anon key returns 0 rows on all three; service-role key sees the true row
counts) — server-side code accesses them exclusively through the service
role client per the project's documented Supabase architecture.

## Functional Requirements

FR-01: The system shall create a new table `position_health_snapshots` if
it does not already exist.

FR-02: The system shall store, for each row, the `symbol` and the
referenced position's original buy timestamp (`position_buy_timestamp`) as
a `text` column, matching the string format already used for the
equivalent field in `open_position_contexts.buy_timestamp`.

FR-03: The system shall store a `snapshot_timestamp` column, as `text`,
recording when the re-evaluation was performed, matching the string format
already used for `agent_log.timestamp`.

FR-04: The system shall store four entry-time reference fields
(`entry_adx_bucket`, `entry_macd_bucket`, `entry_z_bucket`,
`entry_spx_regime`) as nullable `text` columns.

FR-05: The system shall store four freshly-recomputed bucket/regime fields
(`current_adx_bucket`, `current_macd_bucket`, `current_z_bucket`,
`current_spx_regime`) as nullable `text` columns.

FR-06: The system shall store the raw numeric inputs behind the
recomputed buckets (`current_adx`, `current_macd_histogram`,
`current_z_score`, `current_price`) as nullable `double precision` columns.

FR-07: The system shall store `days_since_entry` as a nullable `integer`
column.

FR-08: The system shall generate a primary key `id` of type `uuid` with a
database-side default (`gen_random_uuid()`) when no `id` is supplied by the
caller.

FR-09: The system shall create an index on `(symbol, snapshot_timestamp)`
to support the query pattern "latest snapshot(s) per symbol."

FR-10: The system shall enable Row Level Security on
`position_health_snapshots`, matching the RLS posture empirically confirmed
on `open_position_contexts`, `trade_evaluations`, and `agent_log` (RLS
enabled, no anon-accessible read/write policy — server-side access only via
the service role client).

FR-11: The system shall contain no gate, score, weighted-composite, or
action field in `position_health_snapshots` — the table is observability
data only, per the Phase 2 principle (no automated gates without a
sufficient sample size).

## Non-Functional Requirements

NFR-01: The migration shall not alter, drop, or lock any existing table
(`open_position_contexts`, `trade_evaluations`, `agent_log`, or any other).

NFR-02: The migration shall be idempotent — safe to re-run without error
(`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`).

NFR-03: The migration file shall follow the project's established naming
convention: `{YYYYMMDDHHMMSS}_{snake_case_description}.sql` in
`supabase/migrations/`.

## Constraints

C-01: This migration must not modify Protected Zone application code
(`claude-agent.ts`, `state-fingerprint.ts`, or any other `src/lib/` file) —
migration-only change.

C-02: No RLS policy on any existing table may be modified — only the new
table receives an RLS setting, mirroring (not altering) the existing
posture.

C-03: Row counts on `open_position_contexts` and `trade_evaluations` must
be identical before and after the migration is applied.

C-04: The migration must apply cleanly against the live Supabase project
using the project's established apply pattern (service-role-authenticated
`execute_sql`-style application, consistent with how prior migrations this
session were applied — `mcp__supabase__apply_migration` is not usable for
this project per prior-session findings, since this project is not visible
to that MCP server's `list_projects`).

## Out of Scope

- Any application code change (the health-check script itself is Prompt
  3/4, a separate spec).
- Any dashboard/API route to read `position_health_snapshots` (not
  requested by this prompt).
- A `created_at` audit-timestamp column (the two existing tables that have
  one use it alongside their own text-based business timestamp; this
  prompt's schema does not request one, and none is added here to avoid
  silently expanding scope — noted as a design alternative, not adopted).
- Any RLS *policy* definitions (e.g., explicit `CREATE POLICY` statements)
  beyond enabling RLS itself — the existing three tables were verified to
  have RLS enabled with zero anon-accessible policies; this migration
  matches that same all-closed posture without adding any policy.
